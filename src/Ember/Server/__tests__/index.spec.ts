import { EventEmitter } from 'eventemitter3'

import { berDecode } from '../../../encodings/ber/index.js'
import { Command, GetDirectoryImpl, SubscribeImpl, UnsubscribeImpl } from '../../../model/Command.js'
import { ConnectionOperation } from '../../../model/Connection.js'
import {
	Connection,
	ConnectionImpl,
	Connections,
	EmberElement,
	EmberNodeImpl,
	Matrix,
	MatrixImpl,
	MatrixType,
	NumberedTreeNodeImpl,
	Parameter,
	ParameterImpl,
	ParameterType,
	QualifiedElementImpl,
} from '../../../model/index.js'
import { Collection, EmberValue, NumberedTreeNode, QualifiedElement, RootElement } from '../../../types/types.js'
import { S101Server } from '../../Socket/S101Server.js'
import { EmberServer } from '../index.js'
import type S101Socket from '../../Socket/S101Socket.js'

// A consumer's connection, as the server sees it: requests come in as decoded trees, replies and reports go out
// through sendBER
class FakeConnection extends EventEmitter {
	sent = 0
	received: Buffer[] = []

	sendBER(data: Buffer): boolean {
		this.sent++
		this.received.push(data)
		return true
	}

	/** Sends the server a command for an element */
	request(path: string, command: Command): void {
		const element = new QualifiedElementImpl<EmberElement>(path, new EmberNodeImpl(), {
			0: new NumberedTreeNodeImpl(0, command),
		})
		this.emit('emberTree', { value: { 0: element } })
	}

	/** How many messages the server sends this connection while `fn` runs */
	async countSent(fn: () => void): Promise<number> {
		const before = this.sent
		fn()
		await new Promise(setImmediate)
		return this.sent - before
	}
}

describe('EmberServer subscriptions', () => {
	// A device, 1, with a node, 1.1, holding a parameter, 1.1.1
	let server: EmberServer
	let node: NumberedTreeNode<EmberNodeImpl>
	let parameter: NumberedTreeNode<ParameterImpl>

	beforeEach(async () => {
		jest.spyOn(S101Server.prototype, 'listen').mockResolvedValue() // no port needed
		parameter = new NumberedTreeNodeImpl(1, new ParameterImpl(ParameterType.Integer, 'gain', undefined, 0))
		node = new NumberedTreeNodeImpl(1, new EmberNodeImpl('channel'), { 1: parameter })
		const device = new NumberedTreeNodeImpl(1, new EmberNodeImpl('device'), { 1: node })
		server = new EmberServer(9000)
		await server.init({ 1: device })
	})
	afterEach(() => {
		jest.restoreAllMocks()
	})

	async function connect(): Promise<FakeConnection> {
		const connection = new FakeConnection()
		const s101Server = (server as unknown as { _server: S101Server })._server
		s101Server.emit('connection', connection as unknown as S101Socket)
		await new Promise(setImmediate)
		return connection
	}

	const changeParameter = () => server.update(parameter, { value: Number(parameter.contents.value) + 1 })

	it('sends each change once to a consumer that asked for the same directory more than once', async () => {
		const consumer = await connect()
		for (let i = 0; i < 3; i++) consumer.request('1.1', new GetDirectoryImpl())
		await new Promise(setImmediate)

		expect(await consumer.countSent(changeParameter)).toBe(1)
		expect(await consumer.countSent(() => server.update(node, { description: 'Channel' }))).toBe(1)
	})

	it('sends nothing more after an Unsubscribe, however many GetDirectories came before', async () => {
		const consumer = await connect()
		for (let i = 0; i < 4; i++) consumer.request('1.1', new GetDirectoryImpl())
		consumer.request('1.1', new UnsubscribeImpl())
		await new Promise(setImmediate)

		expect(await consumer.countSent(changeParameter)).toBe(0)
	})

	it('forgets a consumer whose connection has closed', async () => {
		const consumer = await connect()
		for (let i = 0; i < 4; i++) consumer.request('1.1', new GetDirectoryImpl())
		for (let i = 0; i < 2; i++) consumer.request('1.1.1', new GetDirectoryImpl())
		await new Promise(setImmediate)

		consumer.emit('disconnected')
		expect(await consumer.countSent(changeParameter)).toBe(0)
		expect(await consumer.countSent(() => server.update(node, { description: 'Channel' }))).toBe(0)
	})

	// Requests can't list a consumer twice any more, so set such a list up directly
	it('removes every entry for a consumer, even one listed more than once', async () => {
		const consumer = await connect()
		const other = await connect()
		const subscriptions = (server as unknown as { _subscriptions: Record<string, unknown[]> })._subscriptions
		subscriptions['1.1'] = [consumer, consumer, other, consumer, consumer]

		consumer.request('1.1', new UnsubscribeImpl())
		await new Promise(setImmediate)
		expect(subscriptions['1.1']).toEqual([other])
	})

	it('keeps sending to the other consumers', async () => {
		const leaving = await connect()
		const staying = await connect()
		leaving.request('1.1', new GetDirectoryImpl())
		staying.request('1.1', new GetDirectoryImpl())
		leaving.request('1.1', new GetDirectoryImpl())
		await new Promise(setImmediate)
		expect(await staying.countSent(changeParameter)).toBe(1)

		leaving.request('1.1', new UnsubscribeImpl())
		await new Promise(setImmediate)
		expect(await staying.countSent(changeParameter)).toBe(1)

		leaving.emit('disconnected')
		expect(await staying.countSent(changeParameter)).toBe(1)
	})

	// A GetDirectory or Subscribe on a parameter subscribes the consumer to the parameter itself
	it.each([
		['a GetDirectory', () => new GetDirectoryImpl()],
		['a Subscribe', () => new SubscribeImpl()],
	])('sends a change to a consumer that sent %s to the parameter', async (_, command) => {
		const consumer = await connect()
		consumer.request('1.1.1', command())
		await new Promise(setImmediate)

		expect(await consumer.countSent(changeParameter)).toBe(1)
	})

	it('sends a change once to a consumer subscribed to both the parameter and its parent', async () => {
		const consumer = await connect()
		consumer.request('1.1', new GetDirectoryImpl())
		consumer.request('1.1.1', new GetDirectoryImpl())
		await new Promise(setImmediate)

		expect(await consumer.countSent(changeParameter)).toBe(1)
	})

	// A consumer's setValue is answered with the parameter, whether or not the consumer is subscribed to the
	// parameter's parent, and whether or not the value changed
	describe('replies to setValue', () => {
		/** The consumer asks for the parameter 1.1.1 to be set to 6; returns the values of 1.1.1 the server sent it */
		async function requestValue(consumer: FakeConnection) {
			consumer.received.length = 0
			consumer.emit('emberTree', {
				value: {
					0: new QualifiedElementImpl(
						'1.1.1',
						new ParameterImpl(ParameterType.Integer, undefined, undefined, 6)
					),
				},
			})
			await new Promise(setImmediate)
			return consumer.received.map(reportedValue)
		}
		const applyValue = async (p: NumberedTreeNode<Parameter>, value: EmberValue) => {
			server.update(p, { value })
			return true
		}

		it('answers a consumer that is not subscribed to the parent', async () => {
			server.onSetValue = applyValue
			const consumer = await connect()

			expect(await requestValue(consumer)).toEqual([['1.1.1', 6]])
		})

		it('answers a subscribed consumer once, and the other subscribers too', async () => {
			server.onSetValue = applyValue
			const requester = await connect()
			const other = await connect()
			requester.request('1.1', new GetDirectoryImpl())
			other.request('1.1', new GetDirectoryImpl())
			await new Promise(setImmediate)
			other.received.length = 0

			expect(await requestValue(requester)).toEqual([['1.1.1', 6]])
			expect(other.received.map(reportedValue)).toEqual([['1.1.1', 6]])
		})

		it('answers with the current value when there is no handler', async () => {
			const consumer = await connect()

			expect(await requestValue(consumer)).toEqual([['1.1.1', 0]])
		})

		it('answers with the current value when the handler refuses the value', async () => {
			server.onSetValue = async () => Promise.resolve(false)
			const consumer = await connect()

			expect(await requestValue(consumer)).toEqual([['1.1.1', 0]])
		})

		it('answers with the current value when the handler accepts but does not apply it', async () => {
			server.onSetValue = async () => Promise.resolve(true)
			const consumer = await connect()

			expect(await requestValue(consumer)).toEqual([['1.1.1', 0]])
		})

		it('answers with the current value when the handler fails, and reports the error', async () => {
			server.onSetValue = async () => Promise.reject(new Error('device offline'))
			const errors: Error[] = []
			server.on('error', (e) => errors.push(e))
			const consumer = await connect()

			expect(await requestValue(consumer)).toEqual([['1.1.1', 0]])
			expect(errors.map((e) => e.message)).toEqual(['device offline'])
		})

		it('sends a consumer that has had its answer no later changes', async () => {
			server.onSetValue = applyValue
			const consumer = await connect()
			await requestValue(consumer)

			expect(await consumer.countSent(changeParameter)).toBe(0)
		})

		/** The path and value of the parameter a message reports */
		function reportedValue(data: Buffer) {
			const [report] = Object.values<RootElement>(berDecode(data).value as Collection<RootElement>)
			return [(report as QualifiedElement<Parameter>).path, (report.contents as Parameter).value]
		}
	})
})

describe('EmberServer matrices', () => {
	// A device, 1, with a matrix, 1.1: target 0 connected to source 1, target 1 to source 2, target 2 to nothing
	let server: EmberServer
	let matrix: NumberedTreeNode<Matrix>

	async function init(matrixType?: MatrixType) {
		jest.spyOn(S101Server.prototype, 'listen').mockResolvedValue() // no port needed
		const contents = new MatrixImpl('router', [0, 1, 2], [0, 1, 2, 3], {
			0: new ConnectionImpl(0, [1]),
			1: new ConnectionImpl(1, [2]),
			2: new ConnectionImpl(2, []),
		})
		contents.matrixType = matrixType
		matrix = new NumberedTreeNodeImpl(1, contents)
		const device = new NumberedTreeNodeImpl(1, new EmberNodeImpl('device'), { 1: matrix })
		server = new EmberServer(9000)
		await server.init({ 1: device })
	}
	afterEach(() => {
		jest.restoreAllMocks()
	})

	/** Each target's sources, as the server holds them */
	const connectionsOf = () =>
		Object.fromEntries(
			Object.values<Connection>(matrix.contents.connections as { [target: number]: Connection }).map((c) => [
				c.target,
				c.sources,
			])
		)

	describe('update()', () => {
		beforeEach(async () => init())

		it('changes the targets it reports and keeps the others', () => {
			server.update(matrix, { connections: { 0: new ConnectionImpl(0, [3]) } })

			expect(connectionsOf()).toEqual({ 0: [3], 1: [2], 2: [] })
		})

		it('applies the other properties given with the connections', () => {
			server.update(matrix, { description: 'Router', connections: { 2: new ConnectionImpl(2, [0]) } })

			expect(matrix.contents.description).toBe('Router')
			expect(connectionsOf()).toEqual({ 0: [1], 1: [2], 2: [0] })
		})
	})

	// What a provider's onMatrixOperation handler does with a consumer's request
	describe('updateMatrixConnection()', () => {
		const connect = (target: number, ...sources: number[]) =>
			server.updateMatrixConnection(matrix, new ConnectionImpl(target, sources, ConnectionOperation.Connect))
		const absolute = (target: number, ...sources: number[]) =>
			server.updateMatrixConnection(matrix, new ConnectionImpl(target, sources, ConnectionOperation.Absolute))

		describe('n-to-n', () => {
			beforeEach(async () => init(MatrixType.NToN))

			it('connects a source that is already connected only once', () => {
				connect(2, 0)
				connect(2, 0)
				connect(2, 3)
				connect(2, 3)
				connect(0, 1)

				expect(connectionsOf()).toEqual({ 0: [1], 1: [2], 2: [0, 3] })
			})

			it('connects a source listed twice in one request only once', () => {
				connect(2, 3, 3)
				absolute(1, 0, 0)

				expect(connectionsOf()).toEqual({ 0: [1], 1: [0], 2: [3] })
			})

			it('connects several sources to one target', () => {
				connect(0, 2, 3)

				expect(connectionsOf()).toEqual({ 0: [1, 2, 3], 1: [2], 2: [] })
			})
		})

		// "each target must not be connected to more than one source": connecting another source replaces it
		describe.each([
			['one-to-n', MatrixType.OneToN],
			['without a type, so one-to-n', undefined],
		])('%s', (_, matrixType) => {
			beforeEach(async () => init(matrixType))

			it('replaces the source of a target that had one', () => {
				connect(0, 3)

				expect(connectionsOf()).toEqual({ 0: [3], 1: [2], 2: [] })
			})

			it('keeps one source of several requested', () => {
				connect(2, 0, 3)
				absolute(1, 0, 3)

				expect(connectionsOf()).toEqual({ 0: [1], 1: [3], 2: [3] })
			})

			it('leaves a source connected to other targets', () => {
				connect(2, 1)

				expect(connectionsOf()).toEqual({ 0: [1], 1: [2], 2: [1] })
			})
		})

		// "One source may be connected to only one target, and each target must not be connected to more than one
		// source": connecting a source moves it
		describe('one-to-one', () => {
			beforeEach(async () => init(MatrixType.OneToOne))

			it('moves a source off the target that had it', () => {
				connect(0, 2)

				expect(connectionsOf()).toEqual({ 0: [2], 1: [], 2: [] })
			})

			it('reports the target the source moved off too', async () => {
				const consumer = await connectConsumer()
				consumer.request('1.1', new GetDirectoryImpl())
				await new Promise(setImmediate)
				consumer.received.length = 0

				absolute(2, 1)

				expect(consumer.received.map(reportedConnections)).toEqual([{ 0: [], 2: [1] }])
			})
		})

		// "For n-to-n matrices, the maximum number of total connections" and "maximum number of sources for any single
		// target". The matrix starts with 2 connections: target 0 to source 1, target 1 to source 2.
		describe('n-to-n with connect limits', () => {
			beforeEach(async () => init(MatrixType.NToN))
			const limit = (perTarget?: number, total?: number) => {
				matrix.contents.maximumConnectsPerTarget = perTarget
				matrix.contents.maximumTotalConnects = total
			}

			it('connects sources up to the limit per target and refuses more', () => {
				limit(2)

				expect(connect(0, 2)).toBe(true)
				expect(connect(0, 3)).toBe(false)
				expect(absolute(2, 0, 1, 3)).toBe(false)
				expect(connectionsOf()).toEqual({ 0: [1, 2], 1: [2], 2: [] })
			})

			it('connects sources up to the total limit and refuses more', () => {
				limit(undefined, 3)

				expect(connect(2, 0)).toBe(true)
				expect(connect(2, 3)).toBe(false)
				expect(absolute(1, 2, 3)).toBe(false)
				expect(connectionsOf()).toEqual({ 0: [1], 1: [2], 2: [0] })
			})

			it('refuses a change that would exceed either limit', () => {
				limit(3, 4)

				expect(connect(0, 0, 2, 3)).toBe(false)
				expect(connect(2, 0, 1, 3)).toBe(false)
				expect(connectionsOf()).toEqual({ 0: [1], 1: [2], 2: [] })
			})

			it('allows a change that adds no sources, even to a matrix over its limits', () => {
				limit(1, 1)

				expect(absolute(0, 3)).toBe(true)
				expect(
					server.updateMatrixConnection(matrix, new ConnectionImpl(1, [2], ConnectionOperation.Disconnect))
				).toBe(true)
				expect(connectionsOf()).toEqual({ 0: [3], 1: [], 2: [] })
			})

			it('reports the unchanged target when it refuses a change', async () => {
				limit(1)
				const consumer = await connectConsumer()
				consumer.request('1.1', new GetDirectoryImpl())
				await new Promise(setImmediate)
				consumer.received.length = 0

				connect(0, 2)

				expect(consumer.received.map(reportedConnections)).toEqual([{ 0: [1] }])
			})
		})
	})

	// A consumer's connect request is answered with the target's state, whether or not the consumer is subscribed to
	// the matrix, and whether or not anything changed (as a refused setValue is answered with the current value)
	describe('replies to connection requests', () => {
		beforeEach(async () => init(MatrixType.NToN))

		/** The consumer asks for source 3 to be connected to target 2, and waits for the server to handle it */
		async function requestConnect(consumer: FakeConnection) {
			consumer.received.length = 0
			consumer.emit('emberTree', {
				value: {
					0: new QualifiedElementImpl(
						'1.1',
						new MatrixImpl('router', undefined, undefined, {
							2: new ConnectionImpl(2, [3], ConnectionOperation.Connect),
						})
					),
				},
			})
			await new Promise(setImmediate)
			return consumer.received.map(reportedConnections)
		}
		const applyRequest = async (m: NumberedTreeNode<Matrix>, connections: Connections) => {
			// The Connections interface has no implicit string index signature, which Object.values needs
			// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
			for (const connection of Object.values<Connection>(connections as { [target: number]: Connection })) {
				server.updateMatrixConnection(m, connection)
			}
		}

		it('answers a consumer that is not subscribed to the matrix', async () => {
			server.onMatrixOperation = applyRequest
			const consumer = await connectConsumer()

			expect(await requestConnect(consumer)).toEqual([{ 2: [3] }])
		})

		it('answers a subscribed consumer once, and the other subscribers too', async () => {
			server.onMatrixOperation = applyRequest
			const requester = await connectConsumer()
			const other = await connectConsumer()
			requester.request('1.1', new GetDirectoryImpl())
			other.request('1.1', new GetDirectoryImpl())
			await new Promise(setImmediate)
			other.received.length = 0

			expect(await requestConnect(requester)).toEqual([{ 2: [3] }])
			expect(other.received.map(reportedConnections)).toEqual([{ 2: [3] }])
		})

		it('answers with the current state when there is no handler', async () => {
			const consumer = await connectConsumer()

			expect(await requestConnect(consumer)).toEqual([{ 2: [] }])
			expect(connectionsOf()).toEqual({ 0: [1], 1: [2], 2: [] })
		})

		it('answers with the current state when the handler changes nothing', async () => {
			server.onMatrixOperation = async () => Promise.resolve()
			const consumer = await connectConsumer()

			expect(await requestConnect(consumer)).toEqual([{ 2: [] }])
		})

		it('answers with the requested target when the handler changes another one instead', async () => {
			server.onMatrixOperation = async (m) =>
				server.updateMatrixConnection(m, new ConnectionImpl(0, [3], ConnectionOperation.Connect))
			const consumer = await connectConsumer()

			expect(await requestConnect(consumer)).toEqual([{ 2: [] }])
		})

		it('answers with the current state when the handler fails, and reports the error', async () => {
			server.onMatrixOperation = async () => Promise.reject(new Error('router offline'))
			const errors: Error[] = []
			server.on('error', (e) => errors.push(e))
			const consumer = await connectConsumer()

			expect(await requestConnect(consumer)).toEqual([{ 2: [] }])
			expect(errors.map((e) => e.message)).toEqual(['router offline'])
		})

		it('sends a consumer that has had its answer no later reports of the matrix', async () => {
			server.onMatrixOperation = applyRequest
			const consumer = await connectConsumer()
			await requestConnect(consumer)

			expect(await consumer.countSent(() => connectSources(2, 0))).toBe(0)
		})

		const connectSources = (target: number, ...sources: number[]) =>
			server.updateMatrixConnection(matrix, new ConnectionImpl(target, sources, ConnectionOperation.Connect))
	})

	async function connectConsumer(): Promise<FakeConnection> {
		const connection = new FakeConnection()
		const s101Server = (server as unknown as { _server: S101Server })._server
		s101Server.emit('connection', connection as unknown as S101Socket)
		await new Promise(setImmediate)
		return connection
	}

	/** The sources of each target a matrix report lists */
	function reportedConnections(data: Buffer) {
		const [report] = Object.values<RootElement>(berDecode(data).value as Collection<RootElement>)
		const connections = (report.contents as Matrix).connections as { [target: number]: Connection }
		return Object.fromEntries(Object.values<Connection>(connections).map((c) => [c.target, c.sources]))
	}
})
