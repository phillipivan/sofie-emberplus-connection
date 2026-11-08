import { EventEmitter } from 'eventemitter3'

import { Command, GetDirectoryImpl, UnsubscribeImpl } from '../../../model/Command.js'
import {
	EmberElement,
	EmberNodeImpl,
	NumberedTreeNodeImpl,
	ParameterImpl,
	ParameterType,
	QualifiedElementImpl,
} from '../../../model/index.js'
import { NumberedTreeNode } from '../../../types/types.js'
import { S101Server } from '../../Socket/S101Server.js'
import { EmberServer } from '../index.js'
import type S101Socket from '../../Socket/S101Socket.js'

// A consumer's connection, as the server sees it: requests come in as decoded trees, replies and reports go out
// through sendBER
class FakeConnection extends EventEmitter {
	sent = 0

	sendBER(): boolean {
		this.sent++
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
