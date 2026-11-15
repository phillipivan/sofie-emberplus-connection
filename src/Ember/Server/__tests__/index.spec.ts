import { EventEmitter } from 'eventemitter3'

import { berDecode } from '../../../encodings/ber/index.js'
import { Command, GetDirectoryImpl, UnsubscribeImpl } from '../../../model/Command.js'
import { ConnectionOperation } from '../../../model/Connection.js'
import {
	Connection,
	ConnectionImpl,
	EmberElement,
	EmberNodeImpl,
	Matrix,
	MatrixImpl,
	MatrixType,
	NumberedTreeNodeImpl,
	ParameterImpl,
	ParameterType,
	QualifiedElementImpl,
} from '../../../model/index.js'
import { Collection, NumberedTreeNode, RootElement } from '../../../types/types.js'
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
