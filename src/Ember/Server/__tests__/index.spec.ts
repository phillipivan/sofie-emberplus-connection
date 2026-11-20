import { EventEmitter } from 'eventemitter3'

import * as Ber from '../../../Ber/index.js'
import {
	CommandBERID,
	ElementCollectionBERID,
	QualifiedNodeBERID,
	RootBERID,
	RootElementsBERID,
} from '../../../encodings/ber/constants.js'
import { berDecode, berEncode } from '../../../encodings/ber/index.js'
import { at } from '../../../lib/at.js'
import {
	Command,
	CommandType,
	GetDirectoryImpl,
	InvokeImpl,
	SubscribeImpl,
	UnsubscribeImpl,
} from '../../../model/Command.js'
import { ConnectionOperation } from '../../../model/Connection.js'
import {
	childrenOf,
	Connection,
	ConnectionImpl,
	Connections,
	connectionsOf,
	ElementType,
	EmberElement,
	EmberFunctionImpl,
	EmberNodeImpl,
	InvocationResult,
	isQualified,
	Matrix,
	MatrixImpl,
	MatrixType,
	NumberedTreeNodeImpl,
	Parameter,
	ParameterAccess,
	ParameterImpl,
	ParameterType,
	QualifiedElementImpl,
	signalsOf,
} from '../../../model/index.js'
import { InvocationResultImpl } from '../../../model/InvocationResult.js'
import { StreamEntryImpl } from '../../../model/StreamEntry.js'
import { EmberValue, NumberedTreeNode, RelativeOID, RootElement, RootType } from '../../../types/types.js'
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
	request(path: RelativeOID, command: Command): void {
		const element = new QualifiedElementImpl<EmberElement>(
			path,
			new EmberNodeImpl(),
			childrenOf([new NumberedTreeNodeImpl(0, command)])
		)
		this.emit('emberTree', { rootType: RootType.Elements, value: [element] })
	}

	/** How many messages the server sends this connection while `fn` runs */
	async countSent(fn: () => void): Promise<number> {
		const before = this.sent
		fn()
		await new Promise(setImmediate)
		return this.sent - before
	}
}

/** The one element a message reports */
function onlyElement(data: Buffer): RootElement {
	const decoded = berDecode(data)
	if (decoded.rootType !== RootType.Elements) throw new Error('Expected elements')
	const elements = decoded.value
	expect(elements).toHaveLength(1)
	return at(elements, 0)
}

describe('EmberServer subscriptions', () => {
	// A device, 1, with a node, 1.1, holding a parameter, 1.1.1
	let server: EmberServer
	let node: NumberedTreeNode<EmberNodeImpl>
	let parameter: NumberedTreeNode<ParameterImpl<ParameterType.Integer>>

	beforeEach(async () => {
		vi.spyOn(S101Server.prototype, 'listen').mockResolvedValue() // no port needed
		parameter = new NumberedTreeNodeImpl(
			1,
			new ParameterImpl(
				ParameterType.Integer,
				'gain',
				undefined,
				0,
				undefined,
				undefined,
				ParameterAccess.ReadWrite
			)
		)
		node = new NumberedTreeNodeImpl(1, new EmberNodeImpl('channel'), childrenOf([parameter]))
		const device = new NumberedTreeNodeImpl(1, new EmberNodeImpl('device'), childrenOf([node]))
		server = new EmberServer(9000)
		await server.init(childrenOf([device]))
	})
	afterEach(() => {
		vi.restoreAllMocks()
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

	// The consumers of a path are a Set: one can't be listed twice (removing entries with splice while looping over them
	// skipped the entry after each one removed, when the list could hold one more than once)
	it('removes a consumer from a path, keeping the others, and forgets a path left without any', async () => {
		const consumer = await connect()
		const other = await connect()
		const subscriptions = (server as unknown as { _subscriptions: Map<string, Set<unknown>> })._subscriptions
		consumer.request('1.1', new GetDirectoryImpl())
		other.request('1.1', new GetDirectoryImpl())
		await new Promise(setImmediate)
		expect([...(subscriptions.get('1.1') ?? [])]).toEqual([consumer, other])

		consumer.request('1.1', new UnsubscribeImpl())
		await new Promise(setImmediate)
		expect([...(subscriptions.get('1.1') ?? [])]).toEqual([other])

		other.request('1.1', new UnsubscribeImpl())
		await new Promise(setImmediate)
		expect(subscriptions.has('1.1')).toBe(false)
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

	// A provider takes elements from a consumer. A stream collection or an invocation result was walked as if it held
	// elements, and threw.
	it.each<[string, () => Buffer]>([
		[
			'a stream collection',
			() => berEncode([new StreamEntryImpl(1, { type: ParameterType.Integer, value: 5 })], RootType.Streams),
		],
		['an invocation result', () => berEncode(new InvocationResultImpl(1, true), RootType.InvocationResult)],
	])('passes over %s from a consumer', async (_, message) => {
		const consumer = await connect()

		expect(() => consumer.emit('emberTree', berDecode(message()))).not.toThrow()
		await new Promise(setImmediate)
		expect(consumer.sent).toBe(0)
	})

	// A command whose number the DTD doesn't define, or without a number, decodes as CommandType.Unknown, which the
	// server ignores, as a libember provider does. It was taken for a Subscribe (#52).
	describe('commands it does not know', () => {
		/** A command as a consumer sends it, on the element at `path` ('' for the root), with this number, if any */
		function commandMessage(path: string, number: number | undefined): Buffer {
			const writer = new Ber.Writer()
			const command = () => {
				writer.startSequence(CommandBERID)
				if (number !== undefined) {
					writer.startSequence(Ber.CONTEXT(0))
					writer.writeInt(number)
					writer.endSequence()
				}
				writer.endSequence()
			}
			writer.startSequence(RootBERID)
			writer.startSequence(RootElementsBERID)
			writer.startSequence(Ber.CONTEXT(0))
			if (path) {
				writer.startSequence(QualifiedNodeBERID)
				writer.startSequence(Ber.CONTEXT(0))
				writer.writeRelativeOID(path, Ber.BERDataTypes.RELATIVE_OID)
				writer.endSequence()
				writer.startSequence(Ber.CONTEXT(2))
				writer.startSequence(ElementCollectionBERID)
				writer.startSequence(Ber.CONTEXT(0))
				command()
				writer.endSequence()
				writer.endSequence()
				writer.endSequence()
				writer.endSequence()
			} else {
				command()
			}
			writer.endSequence()
			writer.endSequence()
			writer.endSequence()
			return writer.buffer
		}
		async function receive(consumer: FakeConnection, message: Buffer) {
			consumer.emit('emberTree', berDecode(message))
			await new Promise(setImmediate)
		}
		const subscriptions = (path: string) => [
			...((server as unknown as { _subscriptions: Map<string, Set<unknown>> })._subscriptions.get(path) ?? []),
		]

		it.each([
			['the root', ''],
			['a node', '1.1'],
		])('answers a GetDirectory on %s sent this way, and subscribes the consumer', async (_, path) => {
			const consumer = await connect()
			await receive(consumer, commandMessage(path, CommandType.GetDirectory))

			expect(consumer.sent).toBe(1)
			expect(subscriptions(path)).toEqual([consumer])
		})

		describe.each([
			['the root', ''],
			['a node', '1.1'],
		])('on %s', (_, path) => {
			it.each<[string, number | undefined]>([
				['34', 34],
				['0', 0],
				['missing', undefined],
			])('ignores a command whose number is %s: no reply, no subscription', async (_, number) => {
				const consumer = await connect()
				await receive(consumer, commandMessage(path, number))

				expect(consumer.sent).toBe(0)
				expect(subscriptions(path)).toEqual([])
				expect(await consumer.countSent(changeParameter)).toBe(0)
			})
		})
	})

	// A consumer's setValue is answered with the parameter, whether or not the consumer is subscribed to the
	// parameter's parent, and whether or not the value changed
	describe('replies to setValue', () => {
		/** The consumer asks for the parameter 1.1.1 to be set to 6; returns the values of 1.1.1 the server sent it */
		async function requestValue(consumer: FakeConnection) {
			consumer.received.length = 0
			consumer.emit('emberTree', {
				rootType: RootType.Elements,
				value: [
					new QualifiedElementImpl(
						'1.1.1',
						new ParameterImpl(ParameterType.Integer, undefined, undefined, 6)
					),
				],
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

		// Only a writeable parameter takes a consumer's value: any was handed to the handler, so a read-only one took it
		// unless the handler checked its access itself
		describe('on a parameter that is not writeable', () => {
			it.each([
				{ access: ParameterAccess.Read, name: 'Read' },
				{ access: ParameterAccess.None, name: 'None' },
				{ access: undefined, name: 'left out, the default Read' },
			])('answers with the current value, without the handler, when its access is $name', async ({ access }) => {
				parameter.contents.access = access
				const handler = vi.fn(applyValue)
				server.onSetValue = handler
				const warnings: Error[] = []
				server.on('warn', (e) => warnings.push(e))
				const consumer = await connect()

				expect(await requestValue(consumer)).toEqual([['1.1.1', 0]])
				expect(handler).not.toHaveBeenCalled()
				expect(warnings.map((e) => e.message)).toEqual([
					`Parameter 1.1.1: a consumer's setValue refused: its access is ${access ?? ParameterAccess.Read}`,
				])
			})

			it('hands the handler a setValue on a parameter whose access is Write', async () => {
				parameter.contents.access = ParameterAccess.Write
				server.onSetValue = applyValue
				const consumer = await connect()

				expect(await requestValue(consumer)).toEqual([['1.1.1', 6]])
			})
		})

		/** The path and value of the parameter a message reports */
		function reportedValue(data: Buffer) {
			const report = onlyElement(data)
			if (!isQualified(report) || report.contents.type !== ElementType.Parameter) {
				throw new Error('Expected a qualified parameter')
			}
			return [report.path, report.contents.value]
		}
	})
})

// Only a function can be invoked: an Invoke on anything else is answered as a failure, without the handler, which was
// handed whatever was at the path (for the root, the whole tree) as if it were a function
describe('EmberServer invocations', () => {
	// A device, 1, with a node, 1.1, and a function, 1.2
	let server: EmberServer
	let invoked: string[]

	beforeEach(async () => {
		vi.spyOn(S101Server.prototype, 'listen').mockResolvedValue() // no port needed
		const node = new NumberedTreeNodeImpl(1, new EmberNodeImpl('channel'))
		const fn = new NumberedTreeNodeImpl(2, new EmberFunctionImpl('reset'))
		server = new EmberServer(9000)
		await server.init(
			childrenOf([new NumberedTreeNodeImpl(1, new EmberNodeImpl('device'), childrenOf([node, fn]))])
		)
		invoked = []
		server.onInvocation = async (emberFunction, invocation) => {
			invoked.push(emberFunction.contents.identifier ?? '?')
			return Promise.resolve({ id: invocation.contents.invocation?.id ?? -1, success: true })
		}
	})
	afterEach(() => {
		vi.restoreAllMocks()
	})

	/** Sends an Invoke with the given id to the element at `path` ('' for the root); gives the result the server sent */
	async function invoke(path: RelativeOID, id: number): Promise<InvocationResult> {
		const consumer = new FakeConnection()
		const s101Server = (server as unknown as { _server: S101Server })._server
		s101Server.emit('connection', consumer as unknown as S101Socket)
		const command = new InvokeImpl({ id, args: [] })
		if (path) consumer.request(path, command)
		else
			consumer.emit('emberTree', {
				rootType: RootType.Elements,
				value: [new NumberedTreeNodeImpl(0, command)],
			})
		await new Promise(setImmediate)

		expect(consumer.received).toHaveLength(1)
		const decoded = berDecode(at(consumer.received, 0))
		if (decoded.rootType !== RootType.InvocationResult) throw new Error('Expected an invocation result')
		return decoded.value
	}

	it('hands an Invoke on a function to the handler, and sends its result', async () => {
		expect(await invoke('1.2', 7)).toMatchObject({ id: 7, success: true })
		expect(invoked).toEqual(['reset'])
	})

	it.each<[string, RelativeOID]>([
		['a node', '1.1'],
		['the root', ''],
	])('answers an Invoke on %s as a failure, without the handler', async (_, path) => {
		expect(await invoke(path, 8)).toMatchObject({ id: 8, success: false })
		expect(invoked).toEqual([])
	})
})

describe('EmberServer matrices', () => {
	// A device, 1, with a matrix, 1.1: target 0 connected to source 1, target 1 to source 2, target 2 to nothing
	let server: EmberServer
	let matrix: NumberedTreeNode<Matrix>

	async function init(matrixType?: MatrixType) {
		vi.spyOn(S101Server.prototype, 'listen').mockResolvedValue() // no port needed
		const contents = new MatrixImpl(
			'router',
			signalsOf([0, 1, 2]),
			signalsOf([0, 1, 2, 3]),
			connectionsOf([new ConnectionImpl(0, [1]), new ConnectionImpl(1, [2]), new ConnectionImpl(2, [])])
		)
		contents.matrixType = matrixType
		matrix = new NumberedTreeNodeImpl(1, contents)
		const device = new NumberedTreeNodeImpl(1, new EmberNodeImpl('device'), childrenOf([matrix]))
		server = new EmberServer(9000)
		await server.init(childrenOf([device]))
	}
	afterEach(() => {
		vi.restoreAllMocks()
	})

	/** Each target's sources, as the server holds them */
	const sourcesByTarget = () =>
		Object.fromEntries([...(matrix.contents.connections?.values() ?? [])].map((c) => [c.target, c.sources]))

	describe('update()', () => {
		beforeEach(async () => init())

		it('changes the targets it reports and keeps the others', () => {
			server.update(matrix, { connections: connectionsOf([new ConnectionImpl(0, [3])]) })

			expect(sourcesByTarget()).toEqual({ 0: [3], 1: [2], 2: [] })
		})

		it('applies the other properties given with the connections', () => {
			server.update(matrix, { description: 'Router', connections: connectionsOf([new ConnectionImpl(2, [0])]) })

			expect(matrix.contents.description).toBe('Router')
			expect(sourcesByTarget()).toEqual({ 0: [1], 1: [2], 2: [0] })
		})

		// From a caller that doesn't check types. TypeScript can't tie the update to the matrix, so the update was cast
		// to a matrix's, and what it held was used as connections whatever it was.
		it.each<[string, unknown]>([
			['a connection without a target', new Map([[0, { sources: [1] }]])],
			['sources that are not numbers', new Map([[0, { target: 0, sources: ['1'] }]])],
			['a list of targets', [0, 1]],
			['an object, as connections were', { 0: new ConnectionImpl(0, [3]) }],
			// The key is the target the connection is kept under: one under another target would be reported for its own
			['a connection under another target than its own', new Map([[1, new ConnectionImpl(0, [3])]])],
		])('refuses connections that are %s, applying nothing', (_, connections) => {
			const update: Partial<Matrix> = { description: 'Router' }
			Object.assign(update, { connections })

			expect(() => server.update(matrix, update)).toThrow(
				'update: what was given as the connections of 1.1 are not connections'
			)
			expect(matrix.contents.description).toBeUndefined()
			expect(sourcesByTarget()).toEqual({ 0: [1], 1: [2], 2: [] })
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

				expect(sourcesByTarget()).toEqual({ 0: [1], 1: [2], 2: [0, 3] })
			})

			it('connects a source listed twice in one request only once', () => {
				connect(2, 3, 3)
				absolute(1, 0, 0)

				expect(sourcesByTarget()).toEqual({ 0: [1], 1: [0], 2: [3] })
			})

			it('connects several sources to one target', () => {
				connect(0, 2, 3)

				expect(sourcesByTarget()).toEqual({ 0: [1, 2, 3], 1: [2], 2: [] })
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

				expect(sourcesByTarget()).toEqual({ 0: [3], 1: [2], 2: [] })
			})

			it('keeps one source of several requested', () => {
				connect(2, 0, 3)
				absolute(1, 0, 3)

				expect(sourcesByTarget()).toEqual({ 0: [1], 1: [3], 2: [3] })
			})

			it('leaves a source connected to other targets', () => {
				connect(2, 1)

				expect(sourcesByTarget()).toEqual({ 0: [1], 1: [2], 2: [1] })
			})
		})

		// "One source may be connected to only one target, and each target must not be connected to more than one
		// source": connecting a source moves it
		describe('one-to-one', () => {
			beforeEach(async () => init(MatrixType.OneToOne))

			it('moves a source off the target that had it', () => {
				connect(0, 2)

				expect(sourcesByTarget()).toEqual({ 0: [2], 1: [], 2: [] })
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
				expect(sourcesByTarget()).toEqual({ 0: [1, 2], 1: [2], 2: [] })
			})

			it('connects sources up to the total limit and refuses more', () => {
				limit(undefined, 3)

				expect(connect(2, 0)).toBe(true)
				expect(connect(2, 3)).toBe(false)
				expect(absolute(1, 2, 3)).toBe(false)
				expect(sourcesByTarget()).toEqual({ 0: [1], 1: [2], 2: [0] })
			})

			it('refuses a change that would exceed either limit', () => {
				limit(3, 4)

				expect(connect(0, 0, 2, 3)).toBe(false)
				expect(connect(2, 0, 1, 3)).toBe(false)
				expect(sourcesByTarget()).toEqual({ 0: [1], 1: [2], 2: [] })
			})

			it('allows a change that adds no sources, even to a matrix over its limits', () => {
				limit(1, 1)

				expect(absolute(0, 3)).toBe(true)
				expect(
					server.updateMatrixConnection(matrix, new ConnectionImpl(1, [2], ConnectionOperation.Disconnect))
				).toBe(true)
				expect(sourcesByTarget()).toEqual({ 0: [3], 1: [], 2: [] })
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
	// A target or source the matrix doesn't have (targets 0 to 2 and sources 0 to 3 here) is dropped, with a warning: a
	// real target is answered with its current state, a target that doesn't exist not at all. (Such a request was
	// handed to the handler, and such a change applied.)
	describe('a target or source the matrix does not have', () => {
		let warnings: string[]
		beforeEach(async () => {
			await init()
			warnings = []
			server.on('warn', (e) => warnings.push(e.message))
		})

		/** The consumer sends a connection request, and waits for the server to handle it */
		async function request(consumer: FakeConnection, ...connections: Connection[]) {
			consumer.received.length = 0
			const requested = connectionsOf(connections)
			consumer.emit('emberTree', {
				rootType: RootType.Elements,
				value: [new QualifiedElementImpl('1.1', new MatrixImpl(undefined, undefined, undefined, requested))],
			})
			await new Promise(setImmediate)
			return consumer.received.map(reportedConnections)
		}
		const connect = (target: number, ...sources: number[]) =>
			new ConnectionImpl(target, sources, ConnectionOperation.Connect)

		it('drops a request for a target it does not have, answering nothing', async () => {
			const handler = vi.fn(async () => Promise.resolve())
			server.onMatrixOperation = handler
			const consumer = await connectConsumer()

			expect(await request(consumer, connect(9, 1))).toEqual([])
			expect(handler).not.toHaveBeenCalled()
			expect(warnings).toEqual([
				"Matrix 1.1: dropped a consumer's connection request: target 9 is not one of its targets",
			])
		})

		it("drops a request naming a source it does not have, answering with the target's current state", async () => {
			const handler = vi.fn(async () => Promise.resolve())
			server.onMatrixOperation = handler
			const consumer = await connectConsumer()

			expect(await request(consumer, connect(2, 3, 7, 8))).toEqual([{ 2: [] }])
			expect(handler).not.toHaveBeenCalled()
			expect(warnings).toEqual([
				"Matrix 1.1: dropped a consumer's connection request: sources 7, 8 not among its sources",
			])
		})

		it('hands the handler the rest of a request', async () => {
			let given: Connections | undefined
			server.onMatrixOperation = async (m, connections) => {
				given = connections
				for (const c of connections.values()) server.updateMatrixConnection(m, c)
				return Promise.resolve()
			}
			const consumer = await connectConsumer()

			expect(await request(consumer, connect(2, 3), connect(9, 1))).toEqual([{ 2: [3] }])
			expect([...(given?.keys() ?? [])]).toEqual([2])
		})

		it('updateMatrixConnection refuses a change for a target it does not have, reporting nothing', async () => {
			const consumer = await connectConsumer()
			consumer.request('1.1', new GetDirectoryImpl())
			await new Promise(setImmediate)
			consumer.received.length = 0

			expect(server.updateMatrixConnection(matrix, connect(9, 1))).toBe(false)
			await new Promise(setImmediate)

			expect(consumer.received).toEqual([])
			expect(sourcesByTarget()).toEqual({ 0: [1], 1: [2], 2: [] })
			expect(warnings).toEqual(['Matrix 1.1: connection change not applied: target 9 is not one of its targets'])
		})

		it("updateMatrixConnection refuses a change naming a source it does not have, reporting the target's current state", async () => {
			const consumer = await connectConsumer()
			consumer.request('1.1', new GetDirectoryImpl())
			await new Promise(setImmediate)
			consumer.received.length = 0

			expect(server.updateMatrixConnection(matrix, connect(0, 7))).toBe(false)
			await new Promise(setImmediate)

			expect(consumer.received.map(reportedConnections)).toEqual([{ 0: [1] }])
			expect(sourcesByTarget()).toEqual({ 0: [1], 1: [2], 2: [] })
			expect(warnings).toEqual(['Matrix 1.1: connection change not applied: source 7 not among its sources'])
		})
	})

	describe('replies to connection requests', () => {
		beforeEach(async () => init(MatrixType.NToN))

		/** The consumer asks for source 3 to be connected to target 2, and waits for the server to handle it */
		async function requestConnect(consumer: FakeConnection) {
			consumer.received.length = 0
			consumer.emit('emberTree', {
				rootType: RootType.Elements,
				value: [
					new QualifiedElementImpl(
						'1.1',
						new MatrixImpl(
							'router',
							undefined,
							undefined,
							connectionsOf([new ConnectionImpl(2, [3], ConnectionOperation.Connect)])
						)
					),
				],
			})
			await new Promise(setImmediate)
			return consumer.received.map(reportedConnections)
		}
		const applyRequest = async (m: NumberedTreeNode<Matrix>, connections: Connections) => {
			for (const connection of connections.values()) {
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
			expect(sourcesByTarget()).toEqual({ 0: [1], 1: [2], 2: [] })
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
		const report = onlyElement(data)
		if (report.contents.type !== ElementType.Matrix) throw new Error('Expected a matrix')
		const connections = report.contents.connections?.values() ?? []
		return Object.fromEntries([...connections].map((c) => [c.target, c.sources]))
	}
})
