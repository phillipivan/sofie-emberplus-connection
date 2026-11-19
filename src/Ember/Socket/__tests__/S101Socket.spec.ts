import { EventEmitter } from 'events'
import { AddressInfo, connect, Socket } from 'net'

import { S101SendBufferFullError } from '../../../Errors.js'
import S101Codec from '../../../S101/S101Codec.js'
import { ConnectionStatus } from '../../Client/ConnectionStatus.js'
import { EmberServer } from '../../Server/index.js'
import { S101Server, S101ServerOptions } from '../S101Server.js'
import S101Socket from '../S101Socket.js'

// Minimal stand-in for net.Socket: enough to drive the 'data' path and observe destroy().
class FakeSocket extends EventEmitter {
	public destroyed = false
	public wrote: Buffer[] = []
	/** Bytes waiting to be sent: what is written while the peer isn't reading stays waiting */
	public writableLength = 0
	public peerReading = true
	/** What setKeepAlive (TCP keep-alive) was last given */
	public tcpKeepAlive?: [boolean | undefined, number | undefined]

	setKeepAlive(enable?: boolean, initialDelay?: number): this {
		this.tcpKeepAlive = [enable, initialDelay]
		return this
	}

	write(data: Buffer): boolean {
		this.wrote.push(data)
		if (!this.peerReading) this.writableLength += data.length
		return true
	}

	end(cb?: () => void): void {
		cb?.()
		this.emit('close')
	}

	destroy(): void {
		this.destroyed = true
		this.emit('close')
	}
}

// The documentation's S101 section: a consumer "may send a keep-alive request using the non-escaping format. If the
// provider replies with the same framing, the non-escaping format is supported."
describe('S101Socket keep-alive requests', () => {
	const request = new S101Codec().keepAliveRequest()
	const nonEscapingRequest = Buffer.from([0xf8, 0x04, 0x00, 0x00, 0x00, 0x04, 0x00, 0x0e, 0x01, 0x01])

	test.each([
		['an escaping frame', request, new S101Codec().keepAliveResponse()],
		['a non-escaping frame', nonEscapingRequest, new S101Codec().keepAliveResponse(true)],
	])('answers a request in %s in the same form', (_, received, response) => {
		const fake = new FakeSocket()
		new S101Socket(fake as unknown as Socket)

		fake.emit('data', received)

		expect(fake.wrote).toEqual([response])
	})
})

describe('S101Socket abusive-peer handling', () => {
	test('oversized frame disconnects the peer and emits error', () => {
		const fake = new FakeSocket()
		const socket = new S101Socket(fake as unknown as Socket)

		const errors: Error[] = []
		socket.on('error', (e) => errors.push(e))

		// Begin-of-frame then an endless stream of non-EOF bytes.
		fake.emit('data', Buffer.from([0xfe]))
		const chunk = Buffer.alloc(1024 * 1024) // 1 MB of zeros, no 0xff
		for (let i = 0; i < 8 && !fake.destroyed; i++) {
			fake.emit('data', chunk)
		}

		expect(fake.destroyed).toBe(true)
		expect(errors.some((e) => /oversized/i.test(e.message))).toBe(true)
	}, 5000)

	test('a single bad-CRC frame emits error but does NOT disconnect', () => {
		const fake = new FakeSocket()
		const socket = new S101Socket(fake as unknown as Socket)

		const errors: Error[] = []
		socket.on('error', (e) => errors.push(e))

		// Complete frame (BOF .. EOF) with garbage contents -> CRC failure.
		fake.emit('data', Buffer.from([0xfe, 0x00, 0x0e, 0x00, 0x01, 0xff]))

		expect(errors.length).toBeGreaterThan(0)
		expect(fake.destroyed).toBe(false)
	})
})

describe('S101Socket lifecycle', () => {
	it('sets disconnected status on socket close', () => {
		const socket = new FakeSocket()
		const s101Socket = new S101Socket(socket as any)
		const onDisconnected = vi.fn()

		s101Socket.on('disconnected', onDisconnected)
		expect(s101Socket.status).toBe(ConnectionStatus.Connected)

		socket.emit('close')

		expect(onDisconnected).toHaveBeenCalledTimes(1)
		expect(s101Socket.status).toBe(ConnectionStatus.Disconnected)
	})

	it('notifies disconnected listeners after close teardown state is finalized', () => {
		const socket = new FakeSocket()
		const s101Socket = new S101Socket(socket as any)
		const observedStates: Array<{ status: ConnectionStatus; keepaliveTimer: unknown }> = []

		;(s101Socket as any).keepaliveTimer = setTimeout(() => null, 1000)

		s101Socket.on('disconnected', () => {
			observedStates.push({
				status: s101Socket.status,
				keepaliveTimer: (s101Socket as any).keepaliveTimer,
			})
		})

		socket.emit('close')

		expect(observedStates).toHaveLength(1)
		expect(observedStates[0]).toMatchObject({
			status: ConnectionStatus.Disconnected,
			keepaliveTimer: undefined,
		})
	})

	it('drops what the closed connection left half read', () => {
		const socket = new FakeSocket()
		const s101Socket = new S101Socket(socket as any)
		s101Socket.on('error', () => null)

		// The first packet of a message in several, and the start of a non-escaping frame
		socket.emit('data', new S101Codec().encodeBER(Buffer.alloc(3000, 0x01))[0])
		socket.emit('data', Buffer.from([0xf8, 0x01, 0xff, 0x00]))
		socket.emit('close')

		const codec = (s101Socket as any).codec
		expect(codec.multiPacketBuffer).toBeUndefined()
		expect(codec.pendingFrame).toBeUndefined()
	})

	it('handleClose tears down socket and marks disconnected', () => {
		const socket = new FakeSocket()
		const s101Socket = new S101Socket(socket as any)
		const onDisconnected = vi.fn()

		s101Socket.on('disconnected', onDisconnected)
		;(s101Socket as any).keepaliveTimer = setTimeout(() => null, 1000)
		;(s101Socket as any).handleClose()

		expect(socket.destroyed).toBeTruthy()
		expect((s101Socket as any).socket).toBeUndefined()
		expect((s101Socket as any).keepaliveTimer).toBeUndefined()
		expect(s101Socket.status).toBe(ConnectionStatus.Disconnected)
		expect(onDisconnected).toHaveBeenCalled()
	})
})

// What was sent to a peer that doesn't read it was kept waiting without end: a consumer that stopped reading took the
// provider's memory with it
describe('S101Socket maxSendBufferSize', () => {
	function stalled(options?: { maxSendBufferSize?: number }) {
		const fake = new FakeSocket()
		fake.peerReading = false
		const socket = new S101Socket(fake as unknown as Socket, options)
		const errors: Error[] = []
		const disconnected = vi.fn()
		socket.on('error', (e) => errors.push(e))
		socket.on('disconnected', disconnected)
		return { fake, socket, errors, disconnected }
	}

	it('closes the connection once more than it is waiting to be sent', () => {
		const { fake, socket, errors, disconnected } = stalled({ maxSendBufferSize: 100 })

		expect(socket.sendBER(Buffer.alloc(50))).toBe(true)
		expect(fake.destroyed).toBe(false)
		expect(socket.sendBER(Buffer.alloc(50))).toBe(false)

		expect(fake.destroyed).toBe(true)
		expect(disconnected).toHaveBeenCalledTimes(1)
		expect(errors).toHaveLength(1)
		expect(errors[0]).toBeInstanceOf(S101SendBufferFullError)
		expect(errors[0]?.message).toMatch(/more than the maxSendBufferSize of 100/)
	})

	it('counts only what is waiting, not what was sent', () => {
		const fake = new FakeSocket()
		const socket = new S101Socket(fake as unknown as Socket, { maxSendBufferSize: 100 })

		for (let i = 0; i < 20; i++) expect(socket.sendBER(Buffer.alloc(50))).toBe(true)
		expect(fake.destroyed).toBe(false)
	})

	it('sets no limit unless given one', () => {
		const { fake, socket } = stalled()
		fake.writableLength = 1024 * 1024 * 1024

		expect(socket.sendBER(Buffer.alloc(50))).toBe(true)
		expect(fake.destroyed).toBe(false)
	})
})

describe('S101Server the connections it accepts', () => {
	function accept(server: S101Server): { fake: FakeSocket; client: S101Socket } {
		const fake = new FakeSocket()
		fake.peerReading = false
		let client: S101Socket | undefined
		server.once('connection', (c) => (client = c))
		server.addClient(fake as unknown as Socket)
		if (!client) throw new Error('no connection')
		client.on('error', () => null)
		return { fake, client }
	}

	it('closes one with more than 8 MiB waiting to be sent, by default', () => {
		const { fake, client } = accept(new S101Server(0))
		fake.writableLength = 8 * 1024 * 1024 - 100

		expect(client.sendBER(Buffer.alloc(10))).toBe(true)
		expect(client.sendBER(Buffer.alloc(100))).toBe(false)
		expect(fake.destroyed).toBe(true)
	})

	it('takes maxSendBufferSize from its options, as EmberServer passes them on', () => {
		const ember = new EmberServer(0, undefined, { maxSendBufferSize: 100 })
		for (const server of [
			new S101Server(0, undefined, { maxSendBufferSize: 100 }),
			(ember as unknown as { _server: S101Server })._server,
		]) {
			const { fake, client } = accept(server)

			expect(client.sendBER(Buffer.alloc(50))).toBe(true)
			expect(client.sendBER(Buffer.alloc(50))).toBe(false)
			expect(fake.destroyed).toBe(true)
		}
	})
})

// Connections were taken however many came, and each can hold megabytes: a frame cut short, a message in several
// packets, what waits to be sent
describe('EmberServer maxClients', () => {
	async function listening(options?: S101ServerOptions) {
		const server = new EmberServer(0, '127.0.0.1', options)
		const warnings: string[] = []
		server.on('warn', (e) => warnings.push(e.message))
		await server.init(new Map())
		const s101 = (server as unknown as { _server: S101Server })._server
		const port = (s101.server?.address() as AddressInfo).port
		return { server, s101, warnings, port }
	}
	const connected = async (port: number) =>
		new Promise<Socket>((resolve, reject) => {
			const socket = connect(port, '127.0.0.1', () => resolve(socket))
			socket.on('error', reject)
		})
	const closed = async (socket: Socket) => new Promise((resolve) => socket.once('close', resolve))
	/** Closes the consumers' connections, and waits for the server to see them closed */
	async function close(server: EmberServer, sockets: Socket[]) {
		for (const socket of sockets) socket.destroy()
		while ((server as unknown as { _clients: Set<unknown> })._clients.size) await new Promise(setImmediate)
		server.discard()
	}

	it('refuses a connection beyond maxClients, with a warning', async () => {
		const { server, warnings, port } = await listening({ maxClients: 2 })
		const first = await connected(port)
		const second = await connected(port)

		const third = await connected(port)
		await closed(third)

		expect(warnings).toEqual([
			expect.stringMatching(
				/^connection from 127\.0\.0\.1:\d+ refused: 2 consumers are connected, as many as maxClients allows$/
			),
		])
		expect(first.destroyed).toBe(false)
		expect(second.destroyed).toBe(false)
		await close(server, [first, second])
	})

	it('takes 64 by default', async () => {
		const { server, s101 } = await listening()

		expect(s101.server?.maxConnections).toBe(64)
		await close(server, [])
	})
})

// A server didn't send keep-alive requests, so a consumer gone without closing its connection (its power or network
// gone) was never noticed: its connection, and its place among maxClients, were held for good, and updates kept being
// sent to it
describe('keep-alives on the connections a server accepts', () => {
	const REQUEST = new S101Codec().keepAliveRequest()
	const requests = (fake: FakeSocket) => fake.wrote.filter((b) => b.equals(REQUEST)).length

	beforeEach(() => {
		vi.useFakeTimers()
	})
	afterEach(() => {
		vi.useRealTimers()
	})

	function accept(options?: S101ServerOptions) {
		const server = new S101Server(0, undefined, options)
		const fake = new FakeSocket()
		let client: S101Socket | undefined
		server.once('connection', (c) => (client = c))
		server.addClient(fake as unknown as Socket)
		if (!client) throw new Error('no connection')
		const disconnected = vi.fn()
		client.on('disconnected', disconnected)
		return { fake, client, disconnected }
	}

	it('asks a consumer after 5 s in which nothing came, and closes the connection when nothing comes after', async () => {
		const { fake, disconnected } = accept()

		await vi.advanceTimersByTimeAsync(5000)
		expect(requests(fake)).toBe(1)
		await vi.advanceTimersByTimeAsync(4900)
		expect(disconnected).not.toHaveBeenCalled()
		await vi.advanceTimersByTimeAsync(200)
		expect(disconnected).toHaveBeenCalledTimes(1)
		expect(fake.destroyed).toBe(true)
	})

	it('keeps the connection of a consumer that answers', async () => {
		const { fake, disconnected } = accept()

		for (let i = 0; i < 6; i++) {
			await vi.advanceTimersByTimeAsync(5000)
			fake.emit('data', new S101Codec().keepAliveResponse())
		}

		expect(requests(fake)).toBe(6)
		expect(disconnected).not.toHaveBeenCalled()
		fake.destroy()
	})

	it('sends none with keepalive off', async () => {
		const { fake, disconnected } = accept({ keepalive: false })

		await vi.advanceTimersByTimeAsync(30000)

		expect(requests(fake)).toBe(0)
		expect(disconnected).not.toHaveBeenCalled()
		fake.destroy()
	})

	// The system's probes, which a live peer's system answers whatever the program, notice a consumer that is gone, after
	// some minutes, keep-alive requests or not
	it.each([[{}], [{ keepalive: false }]])('turns on TCP keep-alive, with options %j', (options) => {
		const { fake } = accept(options)

		expect(fake.tcpKeepAlive).toEqual([true, 60000])
		fake.destroy()
	})
})
