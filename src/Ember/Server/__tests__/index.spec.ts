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
	FieldFlags,
	GetDirectoryImpl,
	InvokeImpl,
	SubscribeImpl,
	UnsubscribeImpl,
} from '../../../model/Command.js'
import { ConnectionDisposition, ConnectionOperation } from '../../../model/Connection.js'
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
	FunctionArgumentImpl,
	InvocationResult,
	isQualified,
	Matrix,
	MatrixAddressingMode,
	MatrixImpl,
	MatrixType,
	NumberedTreeNodeImpl,
	Parameter,
	ParameterAccess,
	ParameterImpl,
	ParameterType,
	QualifiedElementImpl,
	signalsOf,
	TemplateImpl,
} from '../../../model/index.js'
import { InvocationResultImpl } from '../../../model/InvocationResult.js'
import { StreamDescriptionImpl, StreamFormat } from '../../../model/StreamDescription.js'
import { StreamEntryImpl } from '../../../model/StreamEntry.js'
import {
	EmberTypedValue,
	EmberValue,
	NumberedTreeNode,
	RelativeOID,
	RootElement,
	RootType,
} from '../../../types/types.js'
import { StreamManager } from '../../Client/StreamManager.js'
import { isElementOfType } from '../../Lib/util.js'
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

	// "When applied to a node, … all parameter subscriptions for that consumer must be removed": those below it too.
	// Only the node's own were.
	describe('an Unsubscribe', () => {
		it('on a node removes the subscriptions below it', async () => {
			const consumer = await connect()
			consumer.request('1.1', new GetDirectoryImpl())
			consumer.request('1.1.1', new GetDirectoryImpl())
			consumer.request('1', new UnsubscribeImpl())
			await new Promise(setImmediate)

			expect(await consumer.countSent(changeParameter)).toBe(0)
			expect(await consumer.countSent(() => server.update(node, { description: 'Channel' }))).toBe(0)
		})

		it('on the root removes every subscription', async () => {
			const consumer = await connect()
			consumer.request('1', new GetDirectoryImpl())
			consumer.request('1.1.1', new SubscribeImpl())
			consumer.emit('emberTree', {
				rootType: RootType.Elements,
				value: [new NumberedTreeNodeImpl(0, new UnsubscribeImpl())],
			})
			await new Promise(setImmediate)

			expect(await consumer.countSent(changeParameter)).toBe(0)
			expect(await consumer.countSent(() => server.update(node, { description: 'Channel' }))).toBe(0)
		})

		it("on a parameter removes only the parameter's own, keeping its parent's", async () => {
			const consumer = await connect()
			consumer.request('1.1', new GetDirectoryImpl())
			consumer.request('1.1.1', new SubscribeImpl())
			consumer.request('1.1.1', new UnsubscribeImpl())
			await new Promise(setImmediate)

			expect(await consumer.countSent(changeParameter)).toBe(1)
		})

		it("keeps another consumer's subscriptions, and a path beside the node's", async () => {
			const consumer = await connect()
			const other = await connect()
			const subscriptions = (server as unknown as { _subscriptions: Map<string, Set<unknown>> })._subscriptions
			other.request('1.1', new GetDirectoryImpl())
			consumer.request('1.1', new GetDirectoryImpl())
			await new Promise(setImmediate)
			subscriptions.set('1.10', new Set([consumer])) // beside 1.1, not below it, though its path starts with it
			consumer.request('1.1', new UnsubscribeImpl())
			await new Promise(setImmediate)

			expect(await other.countSent(changeParameter)).toBe(1)
			expect([...(subscriptions.get('1.10') ?? [])]).toEqual([consumer])
		})
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

	// A parameter's value and default must fit its type, as a consumer's setValue must: an update() that would leave one
	// that doesn't is refused whole, before any of it is applied. One was applied, and the encoder refusing the value,
	// the notification failed, and so did every later reply giving the parameter.
	describe('update() of a parameter with a value its type does not fit', () => {
		it.each<[string, Partial<Parameter>, string]>([
			[
				'a string for an integer',
				{ value: 'abc' },
				'a value "abc" doesn\'t fit parameter 1.1.1 of the type INTEGER',
			],
			[
				'a fraction for an integer',
				{ value: 1.5 },
				"a value 1.5 doesn't fit parameter 1.1.1 of the type INTEGER",
			],
			['NaN for an integer', { value: NaN }, "a value NaN doesn't fit parameter 1.1.1 of the type INTEGER"],
			[
				'a default of another type',
				{ defaultValue: 'x' },
				'a default "x" doesn\'t fit parameter 1.1.1 of the type INTEGER',
			],
			[
				'a type the value does not fit',
				{ parameterType: ParameterType.String },
				"a value 0 doesn't fit parameter 1.1.1 of the type STRING",
			],
			[
				'a type that is not one',
				{ parameterType: 'NOPE' as ParameterType },
				'NOPE is not a parameter type, for 1.1.1',
			],
		])('refuses %s, applying and sending nothing', async (_, update, message) => {
			const consumer = await connect()
			consumer.request('1.1', new GetDirectoryImpl())
			await new Promise(setImmediate)
			// from a caller that doesn't check types: TypeScript refuses such an update
			const loose: NumberedTreeNode<Parameter> = parameter
			const misfit: Partial<Parameter> = { ...update, description: 'Gain' }

			expect(await consumer.countSent(() => expect(() => server.update(loose, misfit)).toThrow(message))).toBe(0)
			expect(parameter.contents).toMatchObject({
				parameterType: ParameterType.Integer,
				value: 0,
				description: undefined,
			})

			// the tree is as it was, so a reply giving the parameter still goes out
			expect(await consumer.countSent(() => consumer.request('1.1', new GetDirectoryImpl()))).toBe(1)
		})

		it.each<[string, Partial<Parameter>]>([
			['a whole number', { value: 5 }],
			['null', { value: null }],
			['a type with a value it fits', { parameterType: ParameterType.Real, value: 1.5 }],
			['another property alone', { description: 'Gain' }],
		])('applies %s', (_, update) => {
			expect(() => server.update(parameter, update)).not.toThrow()
			expect(parameter.contents).toMatchObject(update)
		})

		it('reports a handler applying such a value, and answers the consumer with the current value', async () => {
			server.onSetValue = async (p) => {
				server.update(p, { value: 'six' })
				return Promise.resolve(true)
			}
			const errors: string[] = []
			server.on('error', (e) => errors.push(e.message))
			const consumer = await connect()
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

			expect(errors).toEqual(['update: a value "six" doesn\'t fit parameter 1.1.1 of the type INTEGER'])
			expect(consumer.received.map((data) => onlyElement(data).contents)).toMatchObject([{ value: 0 }])
		})
	})

	// "It is only required to inform the clients that have already sent a GetDirectory request to the parent node of
	// the affected parameter. This includes the online/offline state of a node". A node's change went only to the
	// consumers subscribed to the node itself, with its whole subtree.
	describe("a node's change", () => {
		it('goes to a consumer that listed the node, with a GetDirectory on its parent', async () => {
			const consumer = await connect()
			consumer.request('1', new GetDirectoryImpl())
			await new Promise(setImmediate)

			expect(await consumer.countSent(() => server.update(node, { isOnline: false }))).toBe(1)
		})

		it('goes to a consumer that listed the top-level elements', async () => {
			const consumer = await connect()
			consumer.emit('emberTree', {
				rootType: RootType.Elements,
				value: [new NumberedTreeNodeImpl(0, new GetDirectoryImpl())],
			})
			await new Promise(setImmediate)
			const device = server.getElementByPath('1')
			if (!device) throw new Error('Expected the device')

			expect(await consumer.countSent(() => server.update(device, { isOnline: false }))).toBe(1)
		})

		it('goes once to a consumer that listed the node and opened it too', async () => {
			const consumer = await connect()
			consumer.request('1', new GetDirectoryImpl())
			consumer.request('1.1', new GetDirectoryImpl())
			await new Promise(setImmediate)

			expect(await consumer.countSent(() => server.update(node, { isOnline: false }))).toBe(1)
		})

		it('is sent without the elements below the node', async () => {
			const consumer = await connect()
			consumer.request('1.1', new GetDirectoryImpl())
			await new Promise(setImmediate)
			consumer.received.length = 0

			server.update(node, { isOnline: false })
			await new Promise(setImmediate)

			const report = onlyElement(at(consumer.received, 0))
			expect(report.children).toBeUndefined()
			expect(report.contents).toMatchObject({ type: ElementType.Node, isOnline: false })
		})
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

		// The handler, and the events a consumer's request causes, say which consumer it was
		it('gives the handler the consumer that asked', async () => {
			const handler = vi.fn(applyValue)
			server.onSetValue = handler
			const consumer = await connect()
			await requestValue(consumer)

			expect(handler).toHaveBeenCalledWith(parameter, 6, consumer)
		})

		it('gives the error a failing handler causes the consumer that asked', async () => {
			server.onSetValue = async () => Promise.reject(new Error('device offline'))
			const errors: Array<[Error, unknown]> = []
			server.on('error', (e, client) => errors.push([e, client]))
			const consumer = await connect()
			await requestValue(consumer)

			expect(errors).toEqual([[new Error('device offline'), consumer]])
		})

		it('gives the warning for a parameter that is not writeable the consumer that asked', async () => {
			parameter.contents.access = ParameterAccess.Read
			const warned: unknown[] = []
			server.on('warn', (_, client) => warned.push(client))
			const consumer = await connect()
			await requestValue(consumer)

			expect(warned).toEqual([consumer])
		})

		// "If the value is invalid, the provider shall respond with the current value": one that doesn't fit the
		// parameter's type, or isn't a whole number for an integer, isn't handed to the handler. It was, and a handler
		// that applied it left a value in the tree the encoder refuses, so every later reply giving it failed.
		describe('with a value that does not fit the parameter', () => {
			/** The consumer asks for 1.1.1, an integer parameter, to be set to the value given */
			async function request(consumer: FakeConnection, value: Parameter) {
				consumer.received.length = 0
				consumer.emit('emberTree', {
					rootType: RootType.Elements,
					value: [new QualifiedElementImpl('1.1.1', value)],
				})
				await new Promise(setImmediate)
				return consumer.received.map(reportedValue)
			}

			it.each([
				['a string', new ParameterImpl(ParameterType.String, undefined, undefined, 'abc'), 'abc'],
				['a fraction', new ParameterImpl(ParameterType.Real, undefined, undefined, 1.5), '1.5'],
				['NaN', new ParameterImpl(ParameterType.Real, undefined, undefined, NaN), 'NaN'],
				['Infinity', new ParameterImpl(ParameterType.Real, undefined, undefined, Infinity), 'Infinity'],
			])('answers %s with the current value, without the handler, and a warning', async (_, value, shown) => {
				const handler = vi.fn(applyValue)
				server.onSetValue = handler
				const warnings: string[] = []
				server.on('warn', (e) => warnings.push(e.message))
				const consumer = await connect()

				expect(await request(consumer, value)).toEqual([['1.1.1', 0]])
				expect(handler).not.toHaveBeenCalled()
				expect(warnings).toEqual([
					`Parameter 1.1.1: a consumer's setValue refused: ${shown} doesn't fit its type, INTEGER`,
				])

				// the tree is as it was, so a reply giving the parameter still goes out
				consumer.received.length = 0
				consumer.request('1.1', new GetDirectoryImpl())
				await new Promise(setImmediate)
				expect(consumer.received).toHaveLength(1)
			})

			it.each([
				['a whole number', new ParameterImpl(ParameterType.Integer, undefined, undefined, 7), 7],
				['null', new ParameterImpl(ParameterType.Integer, undefined, undefined, null), null],
			])('hands the handler %s', async (_, value, applied) => {
				server.onSetValue = applyValue
				const consumer = await connect()

				expect(await request(consumer, value)).toEqual([['1.1.1', applied]])
			})
		})

		// The minimum and maximum are "the smallest value allowed" and "the largest value allowed", and "If the value is
		// invalid, the provider shall respond with the current value": one outside them, or an enumeration's value that
		// isn't one of its entries, isn't handed to the handler. Any was.
		describe('with a value outside what the parameter allows', () => {
			/** The consumer asks for 1.1.1 to be set to the value given; gives the values it was answered with */
			async function request(consumer: FakeConnection, value: number | null) {
				consumer.received.length = 0
				consumer.emit('emberTree', {
					rootType: RootType.Elements,
					value: [
						new QualifiedElementImpl(
							'1.1.1',
							new ParameterImpl(ParameterType.Integer, undefined, undefined, value)
						),
					],
				})
				await new Promise(setImmediate)
				return consumer.received.map(reportedValue)
			}
			let warnings: string[]
			beforeEach(() => {
				server.onSetValue = applyValue
				warnings = []
				server.on('warn', (e) => warnings.push(e.message))
			})
			const limit = (minimum: number | null | undefined, maximum: number | null | undefined) => {
				parameter.contents.minimum = minimum
				parameter.contents.maximum = maximum
			}

			it.each<[number, string]>([
				[11, '11 is above its maximum, 10'],
				[-11, '-11 is below its minimum, -10'],
			])('answers %d with the current value, without the handler, and a warning', async (value, problem) => {
				limit(-10, 10)
				const consumer = await connect()

				expect(await request(consumer, value)).toEqual([['1.1.1', 0]])
				expect(warnings).toEqual([`Parameter 1.1.1: a consumer's setValue refused: ${problem}`])
			})

			it.each<[string, number | null | undefined, number | null | undefined, number | null]>([
				['the maximum itself', -10, 10, 10],
				['the minimum itself', -10, 10, -10],
				['null', -10, 10, null],
				['any value below a null minimum', null, 10, -1000],
				['any value within an inverted range, which is not checked', 10, -10, 50],
			])('hands the handler %s', async (_, minimum, maximum, value) => {
				limit(minimum, maximum)
				const consumer = await connect()

				expect(await request(consumer, value)).toEqual([['1.1.1', value]])
				expect(warnings).toEqual([])
			})

			it("answers an enumeration's value that isn't one of its entries with the current value, a hidden one being one", async () => {
				Object.assign(parameter.contents, { parameterType: ParameterType.Enum, enumeration: 'Off\n~Test\nOn' })
				const consumer = await connect()

				expect(await request(consumer, 3)).toEqual([['1.1.1', 0]])
				expect(await request(consumer, 1)).toEqual([['1.1.1', 1]])
				expect(warnings).toEqual(["Parameter 1.1.1: a consumer's setValue refused: 3 isn't one of its entries"])
			})
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
// A GetDirectory's field mask asks for some of each element's properties, and the reply gives them as
// TinyEmberPlusRouter does: identifier (1), description (2) and value (4) by their bits, so tree (3) is identifier and
// description and connections (5) identifier and value too; a matrix's counts always; every other property for all
// (or default, or sparse) only; a matrix's targets, sources and connections only on the matrix itself. The mask was
// ignored: every reply had everything.
describe('EmberServer GetDirectory field mask', () => {
	// A device, 1, with a node, 1.1, a parameter, 1.2, a matrix, 1.3, and a function, 1.4
	let server: EmberServer

	beforeEach(async () => {
		vi.spyOn(S101Server.prototype, 'listen').mockResolvedValue() // no port needed
		const node = new NumberedTreeNodeImpl(1, new EmberNodeImpl('channel', 'Channel', undefined, true))
		const parameter = new NumberedTreeNodeImpl(
			2,
			new ParameterImpl(ParameterType.Integer, 'gain', 'Gain', 3, 10, -10, ParameterAccess.ReadWrite)
		)
		const contents = new MatrixImpl(
			'router',
			signalsOf([0, 1]),
			signalsOf([0, 1]),
			connectionsOf([new ConnectionImpl(0, [1])]),
			'Router',
			MatrixType.NToN
		)
		contents.targetCount = 2
		contents.sourceCount = 2
		const matrix = new NumberedTreeNodeImpl(3, contents)
		const fn = new NumberedTreeNodeImpl(4, new EmberFunctionImpl('reset', 'Reset'))
		const device = new NumberedTreeNodeImpl(
			1,
			new EmberNodeImpl('device', 'Device'),
			childrenOf([node, parameter, matrix, fn])
		)
		server = new EmberServer(9000)
		await server.init(childrenOf([device]))
	})
	afterEach(() => {
		vi.restoreAllMocks()
	})

	/** The properties of each element the reply to a GetDirectory on `path` ('' for the root) gives, by path or number */
	async function directory(path: RelativeOID, mask?: FieldFlags) {
		const consumer = new FakeConnection()
		const s101Server = (server as unknown as { _server: S101Server })._server
		s101Server.emit('connection', consumer as unknown as S101Socket)
		const command = new GetDirectoryImpl(mask)
		if (path) consumer.request(path, command)
		else consumer.emit('emberTree', { rootType: RootType.Elements, value: [new NumberedTreeNodeImpl(0, command)] })
		await new Promise(setImmediate)
		const decoded = berDecode(at(consumer.received, 0))
		if (decoded.rootType !== RootType.Elements) throw new Error('Expected elements')
		const properties: Record<string, Record<string, unknown>> = {}
		for (const element of decoded.value) {
			const elements = [element, ...(element.children?.values() ?? [])]
			for (const e of elements) properties['path' in e ? e.path : e.number] = given(e.contents)
		}
		return properties
	}
	/** The properties contents give: those defined, but for the kind and a parameter's type */
	const given = (contents: object) =>
		Object.fromEntries(
			Object.keys(contents)
				.filter((key) => key !== 'type' && key !== 'parameterType')
				.map((key): [string, unknown] => [key, Reflect.get(contents, key)])
				.filter(([, v]) => v !== undefined)
		)

	const everything = {
		1: { identifier: 'channel', description: 'Channel', isOnline: true },
		2: {
			identifier: 'gain',
			description: 'Gain',
			value: 3,
			maximum: 10,
			minimum: -10,
			access: ParameterAccess.ReadWrite,
		},
		3: {
			identifier: 'router',
			description: 'Router',
			matrixType: MatrixType.NToN,
			targetCount: 2,
			sourceCount: 2,
		},
		4: { identifier: 'reset', description: 'Reset' },
	}

	it.each([
		['no mask', undefined],
		['all', FieldFlags.All],
		['default', FieldFlags.Default],
		['sparse', FieldFlags.Sparse],
	])('gives every property for %s', async (_, mask) => {
		expect(await directory('1', mask)).toMatchObject(everything)
	})

	it.each([
		[
			'identifier',
			FieldFlags.Identifier,
			{
				1: { identifier: 'channel' },
				2: { identifier: 'gain' },
				3: { identifier: 'router', targetCount: 2, sourceCount: 2 },
				4: { identifier: 'reset' },
			},
		],
		[
			'description',
			FieldFlags.Description,
			{
				1: { description: 'Channel' },
				2: { description: 'Gain' },
				3: { description: 'Router', targetCount: 2, sourceCount: 2 },
				4: { description: 'Reset' },
			},
		],
		[
			'tree (identifier and description)',
			FieldFlags.Tree,
			{
				1: { identifier: 'channel', description: 'Channel' },
				2: { identifier: 'gain', description: 'Gain' },
				3: { identifier: 'router', description: 'Router', targetCount: 2, sourceCount: 2 },
				4: { identifier: 'reset', description: 'Reset' },
			},
		],
		['value', FieldFlags.Value, { 1: {}, 2: { value: 3 }, 3: { targetCount: 2, sourceCount: 2 }, 4: {} }],
	])('gives the children only what %s asks for', async (_, mask, expected) => {
		const reply = await directory('1', mask)
		for (const [number, properties] of Object.entries<Record<string, unknown>>(expected))
			expect(reply[number]).toEqual(properties)
	})

	it('gives a matrix its connections, identifier and counts for connections on the matrix itself', async () => {
		expect((await directory('1.3', FieldFlags.Connections))['1.3']).toEqual({
			identifier: 'router',
			targetCount: 2,
			sourceCount: 2,
			connections: new Map([
				[0, new ConnectionImpl(0, [1])],
				[1, new ConnectionImpl(1)],
			]),
		})
	})

	it('gives a matrix its targets and sources only for all on the matrix itself', async () => {
		const whole = (await directory('1.3'))['1.3']
		const listed = (await directory('1', FieldFlags.All))['3']

		expect(whole?.targets).toEqual(signalsOf([0, 1]))
		expect(listed?.targets).toBeUndefined()
		expect(listed?.connections).toBeUndefined()
	})

	it('gives a parameter only its value for value', async () => {
		expect(await directory('1.2', FieldFlags.Value)).toEqual({ '1.2': { value: 3 } })
	})

	it('gives the top-level elements only what the mask asks for', async () => {
		expect(await directory('', FieldFlags.Identifier)).toEqual({ 1: { identifier: 'device' } })
	})
})

// "The identifier string must not contain the character "/" … and must begin with a letter or the lower line
// character": one that doesn't is corrected, "/" replaced by "_" and "_" put before it, in the tree, with a warning,
// and kept as the description when there is none, as a description "shall be displayed instead of the identifier".
// It was only warned about, and published as it was. "The identifier of a node must never change": warned about.
describe('EmberServer identifiers', () => {
	let server: EmberServer
	let warnings: string[]

	async function init(...elements: Array<NumberedTreeNode<EmberElement>>) {
		vi.spyOn(S101Server.prototype, 'listen').mockResolvedValue() // no port needed
		server = new EmberServer(9000)
		warnings = []
		server.on('warn', (e) => warnings.push(e.message))
		await server.init(childrenOf([new NumberedTreeNodeImpl(1, new EmberNodeImpl('device'), childrenOf(elements))]))
	}
	afterEach(() => {
		vi.restoreAllMocks()
	})
	const parameter = (number: number, identifier?: string, description?: string) =>
		new NumberedTreeNodeImpl(number, new ParameterImpl(ParameterType.Integer, identifier, description))
	const corrected = (path: string, from: string, to: string) =>
		`Element ${path}: identifier '${from}' corrected to '${to}': an identifier has no "/" and begins with a letter or "_"`

	it('corrects one that contains / or does not begin with a letter or _, keeping it as the description', async () => {
		const elements = [
			parameter(1, 'in/out'),
			parameter(2, '2nd'),
			parameter(3, ''),
			parameter(4, '1/2', 'Half'),
			parameter(5, 'gain'),
			parameter(6, '_x'),
		]
		await init(...elements)

		expect(elements.map((e) => [e.contents.identifier, e.contents.description])).toEqual([
			['in_out', 'in/out'],
			['_2nd', '2nd'],
			['_', ''],
			['_1_2', 'Half'],
			['gain', undefined],
			['_x', undefined],
		])
		expect(warnings).toEqual([
			corrected('1.1', 'in/out', 'in_out'),
			corrected('1.2', '2nd', '_2nd'),
			corrected('1.3', '', '_'),
			corrected('1.4', '1/2', '_1_2'),
		])
	})

	it('corrects one in a template definition, by the path of the template', async () => {
		const level = parameter(1, 'level/dB')
		const templated = new NumberedTreeNodeImpl(7, new EmberNodeImpl('channel'), childrenOf([level]))
		await init(new NumberedTreeNodeImpl(7, new TemplateImpl(templated)))

		expect(level.contents.identifier).toBe('level_dB')
		expect(warnings).toEqual([corrected('1.7.1', 'level/dB', 'level_dB')])
	})

	it("refuses a tree in which a corrected identifier would be a sibling's", async () => {
		await expect(init(parameter(1, 'in/out'), parameter(2, 'in_out'))).rejects.toThrow(
			"Element 1.1: identifier 'in/out' isn't allowed, and 'in_out', which it would be corrected to, is element 1.2's"
		)
	})

	it('corrects one update() sets, and warns when it changes one', async () => {
		const gain = parameter(1, 'gain')
		await init(gain)

		server.update(gain, { identifier: 'gain' })
		server.update(gain, { identifier: 'level' })
		server.update(gain, { identifier: 'a/b' })

		expect(warnings).toEqual([
			"Element 1.1: identifier changed from 'gain' to 'level'",
			corrected('1.1', 'a/b', 'a_b'),
			"Element 1.1: identifier changed from 'level' to 'a_b'",
		])
		expect([gain.contents.identifier, gain.contents.description]).toEqual(['a_b', 'a/b'])
	})

	it("refuses an update() whose corrected identifier would be a sibling's, applying none of it", async () => {
		const gain = parameter(1, 'gain')
		await init(gain, parameter(2, 'a_b'))

		expect(() => server.update(gain, { identifier: 'a/b', value: 5 })).toThrow(
			"Element 1.1: identifier 'a/b' isn't allowed, and 'a_b', which it would be corrected to, is element 1.2's"
		)
		expect([gain.contents.identifier, gain.contents.value]).toEqual(['gain', undefined])
	})
})

// "A template definition has to remain constant over the course of a session", and "No value change notifications
// must be emitted for template elements". A change was applied and reported, an element in a definition by its
// number alone, having no parent.
describe('EmberServer templates', () => {
	// A device, 1, with a parameter, 1.1, a template, 1.7, of a node with a parameter, and a template, 1.8, of a matrix
	let server: EmberServer
	let warnings: string[]
	let gain: NumberedTreeNode<ParameterImpl<ParameterType.Integer>>
	let template: NumberedTreeNode<TemplateImpl>
	let level: NumberedTreeNode<ParameterImpl<ParameterType.Integer>>
	let matrix: NumberedTreeNode<Matrix>
	let consumer: FakeConnection

	beforeEach(async () => {
		vi.spyOn(S101Server.prototype, 'listen').mockResolvedValue() // no port needed
		gain = new NumberedTreeNodeImpl(1, new ParameterImpl(ParameterType.Integer, 'gain', undefined, 0))
		level = new NumberedTreeNodeImpl(1, new ParameterImpl(ParameterType.Integer, 'level', undefined, 0))
		const channel = new NumberedTreeNodeImpl(7, new EmberNodeImpl('channel'), childrenOf([level]))
		template = new NumberedTreeNodeImpl(7, new TemplateImpl(channel, 'A channel'))
		matrix = new NumberedTreeNodeImpl(
			8,
			new MatrixImpl('router', signalsOf([0]), signalsOf([0]), connectionsOf([new ConnectionImpl(0, [])]))
		)
		const matrixTemplate = new NumberedTreeNodeImpl(8, new TemplateImpl(matrix))
		server = new EmberServer(9000)
		warnings = []
		server.on('warn', (e) => warnings.push(e.message))
		await server.init(
			childrenOf([
				new NumberedTreeNodeImpl(1, new EmberNodeImpl('device'), childrenOf([gain, template, matrixTemplate])),
			])
		)
		consumer = new FakeConnection()
		const s101Server = (server as unknown as { _server: S101Server })._server
		s101Server.emit('connection', consumer as unknown as S101Socket)
		consumer.request('1', new GetDirectoryImpl())
		await new Promise(setImmediate)
	})
	afterEach(() => {
		vi.restoreAllMocks()
	})

	it('does not change a template, or report it', async () => {
		expect(await consumer.countSent(() => server.update(template, { description: 'Another' }))).toBe(0)
		expect(template.contents.description).toBe('A channel')
		expect(warnings).toEqual(["Element 1.7: a template definition, which doesn't change: change not applied"])
	})

	it('does not change an element in a template definition, or report it', async () => {
		expect(await consumer.countSent(() => server.update(level, { value: 5 }))).toBe(0)
		expect(level.contents.value).toBe(0)
		expect(warnings).toEqual(["Element 1.7.1: a template definition, which doesn't change: change not applied"])
	})

	it("does not change the connections of a template's matrix", () => {
		expect(server.updateMatrixConnection(matrix, new ConnectionImpl(0, [0]))).toBe(false)
		expect(server.queueMatrixConnection(matrix, new ConnectionImpl(0, [0]))).toBe(false)
		expect(matrix.contents.connections?.get(0)?.sources).toEqual([])
		expect(warnings).toHaveLength(2)
	})

	// "when a consumer queries a template, the provider must report the entire template structure": whatever the mask.
	// It was given as the mask asked, which for identifier left a template (which has none) without anything.
	it('reports a template asked about whole, whatever the field mask, and one listed as the mask asks', async () => {
		consumer.received.length = 0
		consumer.request('1.7', new GetDirectoryImpl(FieldFlags.Identifier))
		consumer.request('1', new GetDirectoryImpl(FieldFlags.Identifier))
		await new Promise(setImmediate)

		const asked = onlyElement(at(consumer.received, 0))
		if (asked.contents.type !== ElementType.Template) throw new Error('Expected a template')
		expect(asked.contents.description).toBe('A channel')
		expect(asked.contents.element?.contents).toMatchObject({ identifier: 'channel' })
		expect([...(asked.contents.element?.children?.keys() ?? [])]).toEqual([1])

		const listed = onlyElement(at(consumer.received, 1)).children?.get(7)
		if (listed?.contents.type !== ElementType.Template) throw new Error('Expected a template')
		expect(listed.contents.description).toBeUndefined()
		expect(listed.contents.element).toBeUndefined()
	})

	it('changes and reports an element outside a template', async () => {
		expect(await consumer.countSent(() => server.update(gain, { value: 5 }))).toBe(1)
		expect(warnings).toEqual([])
	})
})

// "A parameter that contains a stream-identifier requires an explicit subscription in order to report its value via
// the StreamCollection", and parameter change notifications "must not be sent when the parameter has a stream
// identifier". A stream parameter was notified as any parameter, and no stream collection was ever sent.
describe('EmberServer streams', () => {
	// A device, 1, with a node, 1.1, holding: 1.1.1 a real level streamed as 5; 1.1.2 an ordinary gain; 1.1.3 and
	// 1.1.4 integer levels sharing stream 7, packed as 16-bit little-endian at offsets 0 and 2
	let server: EmberServer
	let warnings: string[]
	let level: NumberedTreeNode<ParameterImpl<ParameterType.Real>>
	let gain: NumberedTreeNode<ParameterImpl<ParameterType.Integer>>
	let left: NumberedTreeNode<ParameterImpl<ParameterType.Integer>>
	let right: NumberedTreeNode<ParameterImpl<ParameterType.Integer>>

	/** The contents given, with a stream identifier and, packed, a 16-bit little-endian stream descriptor */
	const streamed = <P extends Parameter>(contents: P, streamIdentifier: number, offset?: number): P => {
		contents.streamIdentifier = streamIdentifier
		if (offset !== undefined) contents.streamDescriptor = new StreamDescriptionImpl(StreamFormat.Int16LE, offset)
		return contents
	}
	const integer = (identifier: string) => new ParameterImpl(ParameterType.Integer, identifier, undefined, 0)

	async function init(...more: Array<NumberedTreeNode<EmberElement>>) {
		vi.spyOn(S101Server.prototype, 'listen').mockResolvedValue() // no port needed
		level = new NumberedTreeNodeImpl(1, streamed(new ParameterImpl(ParameterType.Real, 'level', undefined, 0), 5))
		gain = new NumberedTreeNodeImpl(2, integer('gain'))
		left = new NumberedTreeNodeImpl(3, streamed(integer('left'), 7, 0))
		right = new NumberedTreeNodeImpl(4, streamed(integer('right'), 7, 2))
		const node = new NumberedTreeNodeImpl(
			1,
			new EmberNodeImpl('meters'),
			childrenOf([level, gain, left, right, ...more])
		)
		server = new EmberServer(9000)
		warnings = []
		server.on('warn', (e) => warnings.push(e.message))
		await server.init(childrenOf([new NumberedTreeNodeImpl(1, new EmberNodeImpl('device'), childrenOf([node]))]))
	}
	afterEach(() => {
		vi.restoreAllMocks()
	})

	async function connect(...commands: Array<[RelativeOID, Command]>): Promise<FakeConnection> {
		const consumer = new FakeConnection()
		const s101Server = (server as unknown as { _server: S101Server })._server
		s101Server.emit('connection', consumer as unknown as S101Socket)
		for (const [path, command] of commands) consumer.request(path, command)
		await new Promise(setImmediate)
		consumer.received.length = 0
		return consumer
	}
	/** The stream collections a consumer received, each as its entries */
	const streams = (consumer: FakeConnection) =>
		consumer.received.map((data) => {
			const decoded = berDecode(data)
			if (decoded.rootType !== RootType.Streams) throw new Error('Expected a stream collection')
			return decoded.value.map((entry) => [entry.identifier, entry.value])
		})
	/** Lets the stream collections of what changed now be sent */
	const sent = async () => new Promise(setImmediate)

	describe('values', () => {
		beforeEach(async () => init())

		it('sends a stream value only to a consumer that subscribed to the parameter, in a stream collection', async () => {
			const subscriber = await connect(['1.1.1', new SubscribeImpl()])
			const lister = await connect(['1.1', new GetDirectoryImpl()])
			const asker = await connect(['1.1.1', new GetDirectoryImpl()])

			server.update(level, { value: -12.5 })
			await sent()

			expect(streams(subscriber)).toEqual([[[5, { type: ParameterType.Real, value: -12.5 }]]])
			expect(lister.received).toEqual([])
			expect(asker.received).toEqual([])
		})

		it('sends what changes at once in one stream collection', async () => {
			const subscriber = await connect(['1.1.1', new SubscribeImpl()], ['1.1.3', new SubscribeImpl()])

			server.update(level, { value: -1 })
			server.update(level, { value: -2 })
			server.update(left, { value: 3 })
			await sent()

			expect(subscriber.received).toHaveLength(1)
			expect(streams(subscriber)[0]?.map(([identifier]) => identifier)).toEqual([5, 7])
		})

		it('packs the values of a shared stream by their descriptors, for a consumer of any of them', async () => {
			const subscriber = await connect(['1.1.3', new SubscribeImpl()])

			server.update(left, { value: 3 })
			server.update(right, { value: -2 })
			await sent()

			expect(streams(subscriber)).toEqual([
				[[7, { type: ParameterType.Octets, value: Buffer.from([0x03, 0x00, 0xfe, 0xff]) }]],
			])
		})

		it("gives values the client's StreamManager reads back", async () => {
			const subscriber = await connect(['1.1.1', new SubscribeImpl()], ['1.1.4', new SubscribeImpl()])
			const manager = new StreamManager()
			manager.registerParameter(level.contents, '1.1.1')
			manager.registerParameter(right.contents, '1.1.4')
			const read: Array<[string, unknown]> = []
			manager.on('streamUpdate', (path, value) => read.push([path, value]))

			server.update(level, { value: -6 })
			server.update(right, { value: 300 })
			await sent()
			const decoded = berDecode(at(subscriber.received, 0))
			if (decoded.rootType !== RootType.Streams) throw new Error('Expected a stream collection')
			manager.updateStreamValues(decoded.value)

			expect(read).toEqual([
				['1.1.1', -6],
				['1.1.4', 300],
			])
		})

		it('leaves out a value that does not fit its format, with a warning', async () => {
			const subscriber = await connect(['1.1.3', new SubscribeImpl()])

			server.update(left, { value: 40000 })
			server.update(right, { value: 1 })
			await sent()

			expect(streams(subscriber)).toEqual([
				[[7, { type: ParameterType.Octets, value: Buffer.from([0x00, 0x00, 0x01, 0x00]) }]],
			])
			expect(warnings).toEqual(["Parameter 1.1.3: stream value 40000 doesn't fit Int16LE at offset 0: left out"])
		})

		it('notifies a change to the other properties of a stream parameter as any, without the value', async () => {
			const lister = await connect(['1.1', new GetDirectoryImpl()])

			server.update(level, { description: 'Level', value: -3 })
			await sent()

			expect(lister.received).toHaveLength(1)
			const report = onlyElement(at(lister.received, 0))
			expect(report.contents).toMatchObject({ type: ElementType.Parameter, description: 'Level' })
			expect(report.contents).not.toHaveProperty('value', -3)
		})

		it('still notifies an ordinary parameter as before', async () => {
			const lister = await connect(['1.1', new GetDirectoryImpl()])

			expect(await lister.countSent(() => server.update(gain, { value: 4 }))).toBe(1)
		})
	})

	describe('subscriptions', () => {
		beforeEach(async () => init())

		it('stops after an Unsubscribe of the parameter, or of a node above it', async () => {
			const byParameter = await connect(['1.1.1', new SubscribeImpl()], ['1.1.1', new UnsubscribeImpl()])
			const byNode = await connect(['1.1.1', new SubscribeImpl()], ['1', new UnsubscribeImpl()])
			const staying = await connect(['1.1.1', new SubscribeImpl()])

			server.update(level, { value: -1 })
			await sent()

			expect(byParameter.received).toEqual([])
			expect(byNode.received).toEqual([])
			expect(streams(staying)).toHaveLength(1)
		})

		it('stops for a consumer whose connection has closed', async () => {
			const subscriber = await connect(['1.1.1', new SubscribeImpl()])
			const staying = await connect(['1.1.1', new SubscribeImpl()])
			subscriber.emit('disconnected')

			server.update(level, { value: -1 })
			await sent()

			expect(subscriber.received).toEqual([])
			expect(streams(staying)).toHaveLength(1)
		})
	})

	describe('parameters that are not streams', () => {
		it('warns about a negative stream identifier, and notifies that parameter as any', async () => {
			await init(new NumberedTreeNodeImpl(5, streamed(integer('odd'), -1)))
			const lister = await connect(['1.1', new GetDirectoryImpl()])
			const odd = server.getElementByPath('1.1.5')
			if (!odd || !isElementOfType(odd, ElementType.Parameter)) throw new Error('Expected a parameter')

			expect(await lister.countSent(() => server.update(odd, { value: 1 }))).toBe(1)
			expect(warnings).toEqual(['Parameter 1.1.5: stream identifier -1 is negative: not a stream'])
		})

		it('warns about a stream parameter of the type string', async () => {
			const name = new ParameterImpl(ParameterType.String, 'name', undefined, '')
			name.streamIdentifier = 9
			await init(new NumberedTreeNodeImpl(5, name))

			expect(warnings).toEqual(["Parameter 1.1.5: a stream parameter's type must not be STRING"])
		})
	})
})

// A consumer's request gives a path of numbers (a RELATIVE-OID), a consumer turning an identifier path into one
// itself: it is looked up by number alone. Each part matched a number, an identifier or a description, whichever child
// came first, so a request went to an earlier sibling described with the number asked for. getElementByPath, for the
// provider's own use, matches as the client's does: a path of numbers by numbers alone, any other part by identifier,
// else description, else number, among all the siblings.
describe('EmberServer paths', () => {
	// A device, 1, with a node, 1.1, of channels described with numbers one off theirs (1.1.1 is "2", 1.1.2 is "1"),
	// and two gains: 1.1.3 described "gain", and 1.1.4 identified so
	let server: EmberServer
	let channels: Array<NumberedTreeNode<ParameterImpl<ParameterType.Integer>>>

	beforeEach(async () => {
		vi.spyOn(S101Server.prototype, 'listen').mockResolvedValue() // no port needed
		const parameter = (number: number, identifier: string, description?: string) =>
			new NumberedTreeNodeImpl(
				number,
				new ParameterImpl(
					ParameterType.Integer,
					identifier,
					description,
					0,
					undefined,
					undefined,
					ParameterAccess.ReadWrite
				)
			)
		channels = [
			parameter(1, 'ch1', '2'),
			parameter(2, 'ch2', '1'),
			parameter(3, 'level', 'gain'),
			parameter(4, 'gain'),
		]
		const node = new NumberedTreeNodeImpl(1, new EmberNodeImpl('channels'), childrenOf(channels))
		server = new EmberServer(9000)
		await server.init(childrenOf([new NumberedTreeNodeImpl(1, new EmberNodeImpl('device'), childrenOf([node]))]))
	})
	afterEach(() => {
		vi.restoreAllMocks()
	})

	it("sends a consumer's setValue to the element numbered as asked, not one described so", async () => {
		const handler = vi.fn(async () => Promise.resolve(true))
		server.onSetValue = handler
		const consumer = new FakeConnection()
		const s101Server = (server as unknown as { _server: S101Server })._server
		s101Server.emit('connection', consumer as unknown as S101Socket)
		consumer.emit('emberTree', {
			rootType: RootType.Elements,
			value: [
				new QualifiedElementImpl('1.1.2', new ParameterImpl(ParameterType.Integer, undefined, undefined, 5)),
			],
		})
		await new Promise(setImmediate)

		expect(handler).toHaveBeenCalledWith(channels[1], 5, consumer)
	})

	it.each<[string, string, number | undefined]>([
		['numbers, by numbers alone', '1.1.2', 2],
		['identifiers', 'device.channels.ch1', 1],
		['an identifier before an earlier sibling described with it', 'device.channels.gain', 4],
		['a description, when no identifier matches', 'device.channels.1', 2],
		['numbers and identifiers mixed', '1.channels.ch2', 2],
		['an empty part, as nothing', '1..1', undefined],
		['a trailing delimiter, as nothing', '1.1.', undefined],
		['nothing, as nothing', '', undefined],
	])('getElementByPath finds by %s', (_, path, number) => {
		expect(server.getElementByPath(path)?.number).toBe(number)
	})

	it('getElementByPath takes another delimiter', () => {
		expect(server.getElementByPath('device/channels/ch2', '/')?.number).toBe(2)
	})
})

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

	it('gives the handler the consumer that asked', async () => {
		const clients: unknown[] = []
		server.onInvocation = async (_fn, invocation, client) => {
			clients.push(client)
			return Promise.resolve({ id: invocation.contents.invocation?.id ?? -1, success: true })
		}
		const consumer = new FakeConnection()
		const s101Server = (server as unknown as { _server: S101Server })._server
		s101Server.emit('connection', consumer as unknown as S101Socket)
		consumer.request('1.2', new InvokeImpl({ id: 3, args: [] }))
		await new Promise(setImmediate)

		expect(clients).toEqual([consumer])
	})

	// "The values of the arguments as described in Function.arguments": an Invoke whose arguments are another number,
	// or don't fit their types, is answered as failed, with a warning, without the handler, which was handed any
	describe('arguments', () => {
		/** The function 1.3, set(level: integer, name: string), invoked with the arguments given */
		async function invokeSet(...args: EmberTypedValue[]) {
			const consumer = new FakeConnection()
			const s101Server = (server as unknown as { _server: S101Server })._server
			s101Server.emit('connection', consumer as unknown as S101Socket)
			consumer.request('1.3', new InvokeImpl({ id: 9, args }))
			await new Promise(setImmediate)
			const decoded = berDecode(at(consumer.received, 0))
			if (decoded.rootType !== RootType.InvocationResult) throw new Error('Expected an invocation result')
			return decoded.value
		}
		let warnings: string[]
		beforeEach(async () => {
			const set = new NumberedTreeNodeImpl(
				3,
				new EmberFunctionImpl('set', undefined, [
					new FunctionArgumentImpl(ParameterType.Integer, 'level'),
					new FunctionArgumentImpl(ParameterType.String, 'name'),
				])
			)
			const device = server.getElementByPath('1')
			device?.children?.set(3, set)
			set.parent = device
			warnings = []
			server.on('warn', (e) => warnings.push(e.message))
		})
		const integer = (value: number): EmberTypedValue => ({ type: ParameterType.Integer, value })
		const real = (value: number): EmberTypedValue => ({ type: ParameterType.Real, value })
		const text = (value: string): EmberTypedValue => ({ type: ParameterType.String, value })

		it('hands the handler arguments that fit, a real that is a whole number too', async () => {
			expect(await invokeSet(integer(3), text('a'))).toMatchObject({ id: 9, success: true })
			expect(await invokeSet(real(4), text('b'))).toMatchObject({ id: 9, success: true })
			expect(invoked).toEqual(['set', 'set'])
			expect(warnings).toEqual([])
		})

		it.each([
			['too few', [integer(3)], '1 argument given, 2 described'],
			['too many', [integer(3), text('a'), text('b')], '3 arguments given, 2 described'],
			['of another type', [text('3'), text('a')], "argument 1 (level), 3, doesn't fit its type, INTEGER"],
			[
				'a fraction for an integer',
				[real(1.5), text('a')],
				"argument 1 (level), 1.5, doesn't fit its type, INTEGER",
			],
		])('answers arguments %s as failed, without the handler, and a warning', async (_, args, problem) => {
			expect(await invokeSet(...args)).toMatchObject({ id: 9, success: false })
			expect(invoked).toEqual([])
			expect(warnings).toEqual([`Function 1.3: a consumer's Invoke refused: ${problem}`])
		})

		it('hands the handler any arguments for a function that describes none', async () => {
			expect(await invoke('1.2', 4)).toMatchObject({ id: 4, success: true })
			expect(invoked).toEqual(['reset'])
		})
	})

	// An invocation id is any Integer32 the consumer picks: one of 0 was answered as -1, which it couldn't match
	it('answers a failed Invoke with the id 0 it came with', async () => {
		expect(await invoke('1.1', 0)).toMatchObject({ id: 0, success: false })
	})

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

		it("gives the warning for a consumer's request the consumer, and none for the provider's own change", async () => {
			const warned: unknown[] = []
			server.on('warn', (_, client) => warned.push(client))
			const consumer = await connectConsumer()
			await request(consumer, connect(9, 1))
			server.updateMatrixConnection(matrix, connect(9, 1))

			expect(warned).toEqual([consumer, undefined])
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

		it('gives the handler the consumer that asked', async () => {
			const handler = vi.fn(applyRequest)
			server.onMatrixOperation = handler
			const consumer = await connectConsumer()
			await requestConnect(consumer)

			expect(handler).toHaveBeenCalledWith(matrix, expect.any(Map), consumer)
		})

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

	// A GetDirectory on the matrix itself gives its connections as Lawo's EmberPlusRouter and TinyEmberPlusRouter do:
	// one for every target, with its current sources (none given when it has none), and no disposition or operation.
	// The tree's connections were sent as they were, whatever an app had put on them, and only those it had.
	describe('connections in a directory reply on the matrix', () => {
		beforeEach(async () => init())

		/** Each target's connection in the reply to a GetDirectory on the matrix */
		async function directoryReply() {
			const consumer = await connectConsumer()
			consumer.request('1.1', new GetDirectoryImpl())
			await new Promise(setImmediate)
			const reply = onlyElement(at(consumer.received, 0))
			if (reply.contents.type !== ElementType.Matrix) throw new Error('Expected a matrix')
			return [...(reply.contents.connections?.values() ?? [])].map(
				({ target, sources, operation, disposition }) => ({
					target,
					sources,
					operation,
					disposition,
				})
			)
		}
		const connection = (target: number, sources?: number[]) => ({
			target,
			sources,
			operation: undefined,
			disposition: undefined,
		})

		it('gives every target its current sources, none for a target without', async () => {
			expect(await directoryReply()).toEqual([connection(0, [1]), connection(1, [2]), connection(2)])
		})

		it('leaves out a disposition or operation the tree has, without changing the tree', async () => {
			const stored = matrix.contents.connections?.get(0)
			if (!stored) throw new Error('Expected a connection')
			stored.operation = ConnectionOperation.Connect
			stored.disposition = ConnectionDisposition.Pending

			expect(await directoryReply()).toEqual([connection(0, [1]), connection(1, [2]), connection(2)])
			expect(stored).toEqual(
				new ConnectionImpl(0, [1], ConnectionOperation.Connect, ConnectionDisposition.Pending)
			)
		})

		it('gives every target of a linear matrix without a list, by its count', async () => {
			matrix.contents.targets = undefined
			matrix.contents.targetCount = 4
			matrix.contents.connections = connectionsOf([new ConnectionImpl(1, [2])])

			expect(await directoryReply()).toEqual([connection(0), connection(1, [2]), connection(2), connection(3)])
		})

		it('gives the connections the tree has for a matrix without a list or a linear count', async () => {
			matrix.contents.targets = undefined
			matrix.contents.addressingMode = MatrixAddressingMode.NonLinear
			matrix.contents.targetCount = 4
			matrix.contents.connections = connectionsOf([new ConnectionImpl(5, [2])])

			expect(await directoryReply()).toEqual([connection(5, [2])])
		})
	})

	// The Glow DTD's dispositions: tally (the default, left out) the current state, modified the new current state,
	// pending the future state of a queued change, locked an error, the target locked, with its current state. The
	// server sent none: every report read as tally, so a consumer couldn't tell a change from a refusal.
	describe('dispositions', () => {
		let warnings: string[]
		beforeEach(async () => {
			await init(MatrixType.NToN)
			warnings = []
			server.on('warn', (e) => warnings.push(e.message))
		})

		/** The consumer sends a connection request, and waits for the server to handle it */
		async function request(consumer: FakeConnection, ...connections: Connection[]) {
			consumer.received.length = 0
			consumer.emit('emberTree', {
				rootType: RootType.Elements,
				value: [
					new QualifiedElementImpl(
						'1.1',
						new MatrixImpl(undefined, undefined, undefined, connectionsOf(connections))
					),
				],
			})
			await new Promise(setImmediate)
			return consumer.received.map(reportedDispositions)
		}
		/** A consumer subscribed to the matrix, with nothing received yet */
		async function subscriber() {
			const consumer = await connectConsumer()
			consumer.request('1.1', new GetDirectoryImpl())
			await new Promise(setImmediate)
			consumer.received.length = 0
			return consumer
		}
		const connect = (target: number, ...sources: number[]) =>
			new ConnectionImpl(target, sources, ConnectionOperation.Connect)
		const applyRequest = async (m: NumberedTreeNode<Matrix>, connections: Connections) => {
			for (const connection of connections.values()) server.updateMatrixConnection(m, connection)
		}

		describe('modified and tally', () => {
			// As Lawo's EmberPlusRouter and TinyEmberPlusRouter report every change
			it('reports a change to the requester and the subscribers as modified', async () => {
				server.onMatrixOperation = applyRequest
				const other = await subscriber()
				const requester = await connectConsumer()

				expect(await request(requester, connect(2, 3))).toEqual([{ 2: [[3], ConnectionDisposition.Modified] }])
				expect(other.received.map(reportedDispositions)).toEqual([{ 2: [[3], ConnectionDisposition.Modified] }])
			})

			it("reports a provider's own change as modified, the operation left out", async () => {
				const consumer = await subscriber()

				server.updateMatrixConnection(matrix, connect(2, 0))

				expect(consumer.received.map(reportedDispositions)).toEqual([
					{ 2: [[0], ConnectionDisposition.Modified] },
				])
				const report = onlyElement(at(consumer.received, 0))
				if (report.contents.type !== ElementType.Matrix) throw new Error('Expected a matrix')
				expect(report.contents.connections?.get(2)?.operation).toBeUndefined()
			})

			it('reports a change that leaves the target as it was as tally', async () => {
				const consumer = await subscriber()

				server.updateMatrixConnection(matrix, connect(0, 1)) // already connected
				server.updateMatrixConnection(matrix, new ConnectionImpl(1, [2], ConnectionOperation.Absolute))

				expect(consumer.received.map(reportedDispositions)).toEqual([
					{ 0: [[1], undefined] },
					{ 1: [[2], undefined] },
				])
			})

			it('reports a change refused for the limits as tally', async () => {
				matrix.contents.maximumConnectsPerTarget = 1
				const consumer = await subscriber()

				expect(server.updateMatrixConnection(matrix, connect(0, 2))).toBe(false)

				expect(consumer.received.map(reportedDispositions)).toEqual([{ 0: [[1], undefined] }])
			})

			it('answers a request the handler leaves alone as tally', async () => {
				server.onMatrixOperation = async () => Promise.resolve()
				const consumer = await connectConsumer()

				expect(await request(consumer, connect(2, 3))).toEqual([{ 2: [[], undefined] }])
			})

			it('reports the target a one-to-one source moved off as modified too', async () => {
				await init(MatrixType.OneToOne)
				const consumer = await subscriber()

				server.updateMatrixConnection(matrix, new ConnectionImpl(2, [1], ConnectionOperation.Absolute))

				expect(consumer.received.map(reportedDispositions)).toEqual([
					{ 0: [[], ConnectionDisposition.Modified], 2: [[1], ConnectionDisposition.Modified] },
				])
			})
		})

		describe('locked', () => {
			it('answers a request on a locked target as locked, without the handler', async () => {
				const handler = vi.fn(applyRequest)
				server.onMatrixOperation = handler
				server.setMatrixTargetLocked(matrix, 2)
				const consumer = await connectConsumer()

				expect(await request(consumer, connect(2, 3))).toEqual([{ 2: [[], ConnectionDisposition.Locked] }])
				expect(handler).not.toHaveBeenCalled()
				expect(sourcesByTarget()).toEqual({ 0: [1], 1: [2], 2: [] })
				expect(warnings).toEqual(["Matrix 1.1: refused a consumer's connection request: target 2 is locked"])
			})

			it('gives the warning the consumer that asked', async () => {
				server.setMatrixTargetLocked(matrix, 2)
				const warned: unknown[] = []
				server.on('warn', (_, client) => warned.push(client))
				const consumer = await connectConsumer()
				await request(consumer, connect(2, 3))

				expect(warned).toEqual([consumer])
			})

			it('tells only the requester, and hands the handler the rest of the request', async () => {
				let given: number[] = []
				server.onMatrixOperation = async (m, connections) => {
					given = [...connections.keys()]
					return applyRequest(m, connections)
				}
				server.setMatrixTargetLocked(matrix, 2)
				const other = await subscriber()
				const requester = await connectConsumer()

				expect(await request(requester, connect(2, 3), connect(1, 0))).toEqual([
					{ 1: [[2, 0], ConnectionDisposition.Modified] },
					{ 2: [[], ConnectionDisposition.Locked] },
				])
				expect(given).toEqual([1])
				expect(other.received.map(reportedDispositions)).toEqual([
					{ 1: [[2, 0], ConnectionDisposition.Modified] },
				])
			})

			it('answers as locked a target the handler locks', async () => {
				server.onMatrixOperation = async (m) => {
					server.setMatrixTargetLocked(m, 2) // the device refuses: the target is locked there
					return Promise.resolve()
				}
				const consumer = await connectConsumer()

				expect(await request(consumer, connect(2, 3))).toEqual([{ 2: [[], ConnectionDisposition.Locked] }])
				expect(server.isMatrixTargetLocked(matrix, 2)).toBe(true)
			})

			it('hands the handler a request on a target unlocked again', async () => {
				server.onMatrixOperation = applyRequest
				server.setMatrixTargetLocked(matrix, 2)
				server.setMatrixTargetLocked(matrix, 2, false)
				const consumer = await connectConsumer()

				expect(server.isMatrixTargetLocked(matrix, 2)).toBe(false)
				expect(await request(consumer, connect(2, 3))).toEqual([{ 2: [[3], ConnectionDisposition.Modified] }])
			})

			it("applies the provider's own change to a locked target", async () => {
				server.setMatrixTargetLocked(matrix, 2)
				const consumer = await subscriber()

				expect(server.updateMatrixConnection(matrix, connect(2, 3))).toBe(true)

				expect(consumer.received.map(reportedDispositions)).toEqual([
					{ 2: [[3], ConnectionDisposition.Modified] },
				])
			})

			it('refuses to lock a target the matrix does not have', () => {
				expect(() => server.setMatrixTargetLocked(matrix, 9)).toThrow(
					'Matrix 1.1: target 9 is not one of its targets'
				)
			})

			it('forgets the locks when it is given a new tree', async () => {
				server.setMatrixTargetLocked(matrix, 2)
				await init(MatrixType.NToN)

				expect(server.isMatrixTargetLocked(matrix, 2)).toBe(false)
			})
		})

		describe('pending', () => {
			it('reports a queued change as pending, with the sources the target will have, changing nothing', async () => {
				server.onMatrixOperation = async (m, connections) => {
					for (const connection of connections.values()) server.queueMatrixConnection(m, connection)
					return Promise.resolve()
				}
				const other = await subscriber()
				const requester = await connectConsumer()

				expect(await request(requester, connect(0, 3))).toEqual([
					{ 0: [[1, 3], ConnectionDisposition.Pending] },
				])
				expect(other.received.map(reportedDispositions)).toEqual([
					{ 0: [[1, 3], ConnectionDisposition.Pending] },
				])
				expect(sourcesByTarget()).toEqual({ 0: [1], 1: [2], 2: [] })
			})

			it('reports the change as modified once it is made, or the target as tally if it is not', async () => {
				const consumer = await subscriber()

				server.queueMatrixConnection(matrix, connect(0, 3))
				server.updateMatrixConnection(matrix, connect(0, 3))
				server.queueMatrixConnection(matrix, connect(1, 0))
				server.updateMatrixConnection(matrix, new ConnectionImpl(1, [2], ConnectionOperation.Absolute))

				expect(consumer.received.map(reportedDispositions)).toEqual([
					{ 0: [[1, 3], ConnectionDisposition.Pending] },
					{ 0: [[1, 3], ConnectionDisposition.Modified] },
					{ 1: [[2, 0], ConnectionDisposition.Pending] },
					{ 1: [[2], undefined] },
				])
			})

			it('gives the future sources by the type of the matrix', async () => {
				await init(MatrixType.OneToN)
				const consumer = await subscriber()

				expect(server.queueMatrixConnection(matrix, connect(0, 3))).toBe(true)

				expect(consumer.received.map(reportedDispositions)).toEqual([
					{ 0: [[3], ConnectionDisposition.Pending] },
				])
			})

			it("refuses a change updateMatrixConnection would, reporting the target's current state", async () => {
				const consumer = await subscriber()

				expect(server.queueMatrixConnection(matrix, connect(0, 7))).toBe(false)

				expect(consumer.received.map(reportedDispositions)).toEqual([{ 0: [[1], undefined] }])
				expect(warnings).toEqual(['Matrix 1.1: connection change not queued: source 7 not among its sources'])
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

	/** The sources and disposition of each target a matrix report lists */
	function reportedDispositions(data: Buffer) {
		const report = onlyElement(data)
		if (report.contents.type !== ElementType.Matrix) throw new Error('Expected a matrix')
		const connections = report.contents.connections?.values() ?? []
		return Object.fromEntries([...connections].map((c) => [c.target, [c.sources, c.disposition]]))
	}

	/** The sources of each target a matrix report lists */
	function reportedConnections(data: Buffer) {
		const report = onlyElement(data)
		if (report.contents.type !== ElementType.Matrix) throw new Error('Expected a matrix')
		const connections = report.contents.connections?.values() ?? []
		return Object.fromEntries([...connections].map((c) => [c.target, c.sources]))
	}
})
