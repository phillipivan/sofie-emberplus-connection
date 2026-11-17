import { EventEmitter } from 'events'

import { berDecode, berEncode } from '../../../encodings/ber/index.js'
import { at } from '../../../lib/at.js'
import { GetDirectoryImpl } from '../../../model/Command.js'
import { EmberNodeImpl, NumberedTreeNodeImpl } from '../../../model/index.js'
import S101Codec from '../../../S101/S101Codec.js'
import { RootType } from '../../../types/types.js'
import { ConnectionStatus } from '../../Client/ConnectionStatus.js'
import { EmberClient } from '../../Client/index.js'
import S101Client from '../S101Client.js'

const KEEPALIVE_REQUEST = new S101Codec().keepAliveRequest()
const KEEPALIVE_RESPONSE = new S101Codec().keepAliveResponse()

// Stand-in for net.Socket: connection attempts succeed or fail only when the test
// says so. Once connected it answers keepalives like a live provider, so nothing
// but the client itself closes it.
class FakeNetSocket extends EventEmitter {
	/** Connection attempts started, across all sockets. */
	static attempts = 0
	/** When each of those attempts started, in (fake) Date.now() time. */
	static attemptTimes: number[] = []

	connecting = false
	destroyed = false
	/** Keepalive requests written to this socket, across its connections */
	keepaliveRequests = 0
	/** Whether it answers them, as a live provider does */
	answerKeepalives = true

	connect(): this {
		FakeNetSocket.attempts++
		FakeNetSocket.attemptTimes.push(Date.now())
		this.connecting = true
		this.destroyed = false
		return this
	}

	/** The attempt in flight succeeds. */
	succeed(): void {
		this.connecting = false
		this.emit('connect')
	}

	/** The attempt in flight is refused: net.Socket emits 'error', then 'close'. */
	refuse(): void {
		this.connecting = false
		this.emit('error', new Error('connect ECONNREFUSED'))
		this.emit('close', true)
	}

	write(data: Buffer): boolean {
		if (data.equals(KEEPALIVE_REQUEST)) {
			this.keepaliveRequests++
			if (this.answerKeepalives) queueMicrotask(() => this.emit('data', KEEPALIVE_RESPONSE))
		}
		return true
	}

	end(cb?: () => void): void {
		cb?.()
	}

	/** Like net.Socket, emits 'close' asynchronously (once). */
	destroy(): this {
		if (!this.destroyed) queueMicrotask(() => this.emit('close', false))
		this.connecting = false
		this.destroyed = true
		return this
	}
}

// The real BER codec, with berDecode wrapped so a test can count its calls or make one fail
jest.mock('../../../encodings/ber/index.js', () => {
	const actual = jest.requireActual('../../../encodings/ber/index.js')
	return { ...actual, berDecode: jest.fn(actual.berDecode) }
})

jest.mock('net', () => ({
	__esModule: true,
	default: {
		Socket: jest.fn(() => new FakeNetSocket()),
	},
}))

/** The socket the client is currently using. */
function currentSocket(client: S101Client): FakeNetSocket {
	const socket = (client as unknown as { socket?: FakeNetSocket }).socket
	if (!socket) throw new Error('the client has no socket')
	return socket
}

/**
 * Advances fake time 1 s at a time. (One large jump doesn't give the fake socket
 * the chance to answer each keepalive in time, so the client would drop it.)
 */
async function advanceInSteps(duration: number): Promise<void> {
	for (let elapsed = 0; elapsed < duration; elapsed += 1000) await jest.advanceTimersByTimeAsync(1000)
}

/** Refuses every connection attempt for `duration` ms, checking each second. */
async function refuseFor(client: S101Client, duration: number): Promise<void> {
	for (let elapsed = 0; elapsed < duration; elapsed += 1000) {
		const socket = currentSocket(client)
		if (socket.connecting) socket.refuse()
		await jest.advanceTimersByTimeAsync(1000)
	}
}

/** Follows a connect() promise: `result` is 'pending' until it settles, then what it resolved with. */
function track(promise: Promise<Error | void>): { result: Error | void | 'pending' } {
	const state: { result: Error | void | 'pending' } = { result: 'pending' }
	void promise.then((result) => (state.result = result))
	return state
}

/** The time between each pair of consecutive attempts. */
function gaps(times: number[]): number[] {
	return times.slice(1).map((time, i) => time - at(times, i))
}

describe('S101Client connection attempts', () => {
	beforeEach(() => {
		jest.useFakeTimers()
	})
	afterEach(() => {
		jest.useRealTimers()
	})

	it('does not let a replaced attempt time out the connection that replaced it', async () => {
		const client = new S101Client('127.0.0.1', 9000)
		client.on('error', () => null)
		// A timeout longer than the 5 s retry interval, so a retry replaces the
		// attempt while it is still pending, long before its own timeout fires.
		void client.connect(12)

		// Nothing answers; the retry at 5 s replaces the pending socket and connects.
		await jest.advanceTimersByTimeAsync(5000)
		const connection = currentSocket(client)
		connection.succeed()
		expect(client.status).toBe(ConnectionStatus.Connected)

		// The replaced attempt's timeout fires at 12 s. That attempt is gone; its
		// timeout must leave the live connection alone.
		await jest.advanceTimersByTimeAsync(8000)
		expect(connection.destroyed).toBe(false)
		expect(currentSocket(client)).toBe(connection)
		expect(client.status).toBe(ConnectionStatus.Connected)

		client.removeAllListeners()
		await client.disconnect()
	})

	it('does not let a refused attempt time out a retry on the same socket', async () => {
		const client = new S101Client('127.0.0.1', 9000)
		client.on('error', () => null)
		// A timeout longer than the 5 s before the first retry, so the refused
		// attempt's timeout would still be running when the retry starts.
		void client.connect(8)
		const socket = currentSocket(client)
		socket.refuse()

		// The retry at 5 s reuses the refused socket...
		await jest.advanceTimersByTimeAsync(5000)
		expect(currentSocket(client)).toBe(socket)
		expect(socket.connecting).toBe(true)

		// ...and the refused attempt's timeout at 8 s belongs to an attempt that
		// has already ended: it must leave the retry alone.
		await jest.advanceTimersByTimeAsync(3000)
		expect(socket.destroyed).toBe(false)

		socket.succeed()
		expect(client.status).toBe(ConnectionStatus.Connected)

		client.removeAllListeners()
		await client.disconnect()
	})

	it('settles connect() when the attempt is refused, without waiting for the timeout', async () => {
		const client = new S101Client('127.0.0.1', 9000)
		client.on('error', () => null)
		let settled: Error | void | 'pending' = 'pending'
		void client.connect().then((result) => (settled = result))

		currentSocket(client).refuse()
		await jest.advanceTimersByTimeAsync(0) // settle promises; the 5 s timeout stays far off

		expect(settled).toBeInstanceOf(Error)

		client.removeAllListeners()
		await client.disconnect()
	})
})

describe('S101Client connect() when it does not start an attempt', () => {
	beforeEach(() => {
		jest.useFakeTimers()
		FakeNetSocket.attempts = 0
		FakeNetSocket.attemptTimes = []
	})
	afterEach(() => {
		jest.useRealTimers()
	})

	it('settles with the attempt under way', async () => {
		const client = new S101Client('127.0.0.1', 9000)
		client.on('error', () => null)
		const first = track(client.connect())
		const second = track(client.connect())
		expect(FakeNetSocket.attempts).toBe(1)

		currentSocket(client).succeed()
		await jest.advanceTimersByTimeAsync(0)
		expect(first.result).toBeUndefined()
		expect(second.result).toBeUndefined()

		client.removeAllListeners()
		await client.disconnect()
	})

	it('settles with the next retry when called straight after a refusal', async () => {
		const client = new S101Client('127.0.0.1', 9000)
		client.on('error', () => null)
		const first = track(client.connect())
		currentSocket(client).refuse()
		await jest.advanceTimersByTimeAsync(0)
		expect(first.result).toBeInstanceOf(Error)

		// Calling again at once doesn't dial, so a retry loop can't hammer the provider...
		const second = track(client.connect())
		await jest.advanceTimersByTimeAsync(4000)
		expect(FakeNetSocket.attempts).toBe(1)
		expect(second.result).toBe('pending')

		// ...it settles with the retry at 5 s.
		await jest.advanceTimersByTimeAsync(1000)
		expect(FakeNetSocket.attempts).toBe(2)
		currentSocket(client).succeed()
		await jest.advanceTimersByTimeAsync(0)
		expect(second.result).toBeUndefined()

		client.removeAllListeners()
		await client.disconnect()
	})

	it('settles a replaced attempt with the attempt that replaced it', async () => {
		const client = new S101Client('127.0.0.1', 9000)
		client.on('error', () => null)
		const first = track(client.connect(12))

		// The retry at 5 s replaces the attempt and connects: the first caller is
		// connected now, not told at 12 s that its attempt timed out.
		await jest.advanceTimersByTimeAsync(5000)
		currentSocket(client).succeed()
		await jest.advanceTimersByTimeAsync(0)
		expect(first.result).toBeUndefined()

		client.removeAllListeners()
		await client.disconnect()
	})

	it("is not settled by a replaced attempt's timeout", async () => {
		const client = new S101Client('127.0.0.1', 9000)
		client.on('error', () => null)
		// Attempt A, timing out at 12 s, is replaced by the retry at 5 s, which is refused.
		void client.connect(12)
		await jest.advanceTimersByTimeAsync(5000)
		currentSocket(client).refuse()

		// Attempt C at 11 s...
		await jest.advanceTimersByTimeAsync(6000)
		const third = track(client.connect(20))
		expect(FakeNetSocket.attempts).toBe(3)

		// ...is still under way when A's timeout falls due at 12 s, and must stay so...
		await jest.advanceTimersByTimeAsync(1000)
		expect(third.result).toBe('pending')

		// ...until it connects at 13 s.
		await jest.advanceTimersByTimeAsync(1000)
		currentSocket(client).succeed()
		await jest.advanceTimersByTimeAsync(0)
		expect(third.result).toBeUndefined()

		client.removeAllListeners()
		await client.disconnect()
	})

	it('is not settled by the close of an attempt disconnect() abandoned', async () => {
		const client = new S101Client('127.0.0.1', 9000)
		client.on('error', () => null)
		const first = track(client.connect())

		// disconnect() abandons the attempt; its socket closes a moment later...
		void client.disconnect()
		const second = track(client.connect()) // within 5 s: waits for the next attempt
		await jest.advanceTimersByTimeAsync(0)
		expect(first.result).toBeInstanceOf(Error)
		// ...which isn't the attempt the second call waits for.
		expect(second.result).toBe('pending')

		await jest.advanceTimersByTimeAsync(5000)
		currentSocket(client).succeed()
		await jest.advanceTimersByTimeAsync(0)
		expect(second.result).toBeUndefined()

		client.removeAllListeners()
		await client.disconnect()
	})

	it('settles with an Error when disconnect() comes first', async () => {
		const client = new S101Client('127.0.0.1', 9000)
		client.on('error', () => null)
		void client.connect()
		currentSocket(client).refuse()
		const waiting = track(client.connect()) // for the retry at 5 s

		await client.disconnect()
		await jest.advanceTimersByTimeAsync(0)
		expect(waiting.result).toBeInstanceOf(Error)
	})
})

describe('S101Client reconnecting', () => {
	beforeEach(() => {
		jest.useFakeTimers()
		FakeNetSocket.attempts = 0
		FakeNetSocket.attemptTimes = []
	})
	afterEach(() => {
		jest.useRealTimers()
	})

	it('keeps retrying however long the provider refuses connections', async () => {
		const client = new S101Client('127.0.0.1', 9000)
		client.on('error', () => null)
		void client.connect()

		// The provider refuses every attempt for 10 minutes...
		await refuseFor(client, 600000)
		// ...then comes back: the client must still be trying, at least once a minute.
		const before = FakeNetSocket.attempts
		for (let waited = 0; FakeNetSocket.attempts === before && waited < 60000; waited += 1000) {
			await jest.advanceTimersByTimeAsync(1000)
		}
		expect(FakeNetSocket.attempts).toBeGreaterThan(before)

		currentSocket(client).succeed()
		expect(client.status).toBe(ConnectionStatus.Connected)

		client.removeAllListeners()
		await client.disconnect()
	})

	it('backs off from 5 s to a minute between attempts', async () => {
		const client = new S101Client('127.0.0.1', 9000)
		client.on('error', () => null)
		void client.connect()

		// Attempts at 0, 5, 15, 30, 50 s, ..., 330 s, then once a minute
		await refuseFor(client, 520000)
		expect(gaps(FakeNetSocket.attemptTimes)).toEqual([
			5000, 10000, 15000, 20000, 25000, 30000, 35000, 40000, 45000, 50000, 55000, 60000, 60000, 60000,
		])

		client.removeAllListeners()
		await client.disconnect()
	})

	it('starts over from 5 s when a connection drops', async () => {
		const client = new S101Client('127.0.0.1', 9000)
		client.on('error', () => null)
		void client.connect()

		// Attempts at 0, 5, 15, 30 and 50 s are refused; the one at 75 s connects.
		await refuseFor(client, 75000)
		const connection = currentSocket(client)
		connection.succeed()
		expect(client.status).toBe(ConnectionStatus.Connected)
		await advanceInSteps(30000)
		expect(client.status).toBe(ConnectionStatus.Connected)

		// The connection drops: the client tries again at once, then backs off from 5 s.
		const droppedAt = Date.now()
		const before = FakeNetSocket.attemptTimes.length
		connection.emit('close', false)
		await refuseFor(client, 35000)
		expect(FakeNetSocket.attemptTimes.slice(before).map((t) => t - droppedAt)).toEqual([0, 5000, 15000, 30000])

		client.removeAllListeners()
		await client.disconnect()
	})

	it('starts over from 5 s when connect() is called after a disconnect', async () => {
		const client = new S101Client('127.0.0.1', 9000)
		client.on('error', () => null)
		void client.connect()
		await refuseFor(client, 35000) // attempts at 0, 5, 15 and 30 s

		await client.disconnect()
		const restartedAt = Date.now()
		const before = FakeNetSocket.attemptTimes.length
		void client.connect()
		await refuseFor(client, 20000)
		expect(FakeNetSocket.attemptTimes.slice(before).map((t) => t - restartedAt)).toEqual([0, 5000, 15000])

		client.removeAllListeners()
		await client.disconnect()
	})
})

describe('S101Client disconnect', () => {
	beforeEach(() => {
		jest.useFakeTimers()
		FakeNetSocket.attempts = 0
		FakeNetSocket.attemptTimes = []
	})
	afterEach(() => {
		jest.useRealTimers()
	})

	it('abandons a pending attempt and stops retrying', async () => {
		const client = new S101Client('127.0.0.1', 9000)
		client.on('error', () => null)
		void client.connect()
		const pending = currentSocket(client)

		await client.disconnect()
		expect(pending.destroyed).toBe(true)

		await jest.advanceTimersByTimeAsync(60000)
		expect(FakeNetSocket.attempts).toBe(1)
		expect(client.status).toBe(ConnectionStatus.Disconnected)
	})

	it('stops retrying when disconnected between attempts', async () => {
		const client = new S101Client('127.0.0.1', 9000)
		client.on('error', () => null)
		void client.connect()
		currentSocket(client).refuse()

		await client.disconnect()

		await jest.advanceTimersByTimeAsync(60000)
		expect(FakeNetSocket.attempts).toBe(1)
		expect(client.status).toBe(ConnectionStatus.Disconnected)
	})

	it('stays disconnected when a replaced attempt times out afterwards', async () => {
		const client = new S101Client('127.0.0.1', 9000)
		client.on('error', () => null)
		// The retry at 5 s replaces this attempt; its own timeout is still due at 12 s.
		void client.connect(12)
		await jest.advanceTimersByTimeAsync(5000)

		await client.disconnect()

		await jest.advanceTimersByTimeAsync(60000)
		expect(FakeNetSocket.attempts).toBe(2)
		expect(client.status).toBe(ConnectionStatus.Disconnected)
	})

	it('connects again when asked after a disconnect', async () => {
		const client = new S101Client('127.0.0.1', 9000)
		client.on('error', () => null)
		void client.connect()
		await client.disconnect()
		await jest.advanceTimersByTimeAsync(5000)

		void client.connect()
		currentSocket(client).succeed()
		expect(client.status).toBe(ConnectionStatus.Connected)

		client.removeAllListeners()
		await client.disconnect()
	})
})

describe('EmberClient discard', () => {
	beforeEach(() => {
		jest.useFakeTimers()
		FakeNetSocket.attempts = 0
		FakeNetSocket.attemptTimes = []
	})
	afterEach(() => {
		jest.useRealTimers()
	})

	it('stops a client that is reconnecting', async () => {
		const client = new EmberClient('127.0.0.1', 9000)
		client.on('error', () => null)
		void client.connect()
		const s101 = (client as unknown as { _client: S101Client })._client
		currentSocket(s101).refuse()

		client.discard()

		await jest.advanceTimersByTimeAsync(60000)
		expect(FakeNetSocket.attempts).toBe(1)
	})
})

// The socket's disconnect() sets its status first, so its close emits no 'disconnected', which is what rejected the
// requests waiting; and timeouts are checked only while connected, so they waited for good
describe('EmberClient disconnect', () => {
	beforeEach(() => {
		jest.useFakeTimers()
	})
	afterEach(() => {
		jest.useRealTimers()
	})

	it('rejects the requests waiting', async () => {
		const client = new EmberClient('127.0.0.1', 9000)
		client.on('error', () => null)
		currentSocket((client as unknown as { _client: S101Client })._client).succeed()
		await jest.advanceTimersByTimeAsync(0)
		expect(client.connected).toBe(true)
		const request = await client.getDirectory(new NumberedTreeNodeImpl(1, new EmberNodeImpl('a')))
		let rejection: unknown
		request.response?.catch((e: unknown) => (rejection = e))

		await client.disconnect()
		await jest.advanceTimersByTimeAsync(10000)

		expect(rejection).toBeInstanceOf(Error)
		expect((rejection as Error).message).toBe('Socket was disconnected')
		client.discard()
	})
})

describe('EmberClient connect', () => {
	beforeEach(() => {
		jest.useFakeTimers()
	})
	afterEach(() => {
		jest.useRealTimers()
	})

	// The constructor already starts an attempt, so connect() right after it
	// must settle with that attempt instead of waiting forever.
	it('resolves once the attempt the constructor started connects', async () => {
		const client = new EmberClient('127.0.0.1', 9000)
		client.on('error', () => null)
		const connecting = track(client.connect())

		currentSocket((client as unknown as { _client: S101Client })._client).succeed()
		await jest.advanceTimersByTimeAsync(0)
		expect(connecting.result).toBeUndefined()

		client.discard()
	})

	it('resolves with an Error when the attempt the constructor started is refused', async () => {
		const client = new EmberClient('127.0.0.1', 9000)
		client.on('error', () => null)
		const connecting = track(client.connect())

		currentSocket((client as unknown as { _client: S101Client })._client).refuse()
		await jest.advanceTimersByTimeAsync(0)
		expect(connecting.result).toBeInstanceOf(Error)

		client.discard()
	})

	it('rejects with an Error when there is no host', async () => {
		const client = new EmberClient('', 9000)
		client.on('error', () => null)

		const rejection: unknown = await client.connect().catch((e: unknown) => e)

		expect(rejection).toBeInstanceOf(Error)
		expect((rejection as Error).message).toBe('No host specified')
		client.discard()
	})
})

/** A connected client, and its socket */
function connectedClient(): { client: S101Client; socket: FakeNetSocket } {
	const client = new S101Client('127.0.0.1', 9000)
	client.on('error', () => null)
	void client.connect()
	const socket = currentSocket(client)
	socket.succeed()
	return { client, socket }
}

/** A message from a provider, as one frame */
const PROVIDER_MESSAGE = at(
	new S101Codec().encodeBER(berEncode([new NumberedTreeNodeImpl(1, new EmberNodeImpl('a'))], RootType.Elements)),
	0
)

// The Ember+ documentation, Keep-Alive mechanism: a request "should only be sent when there hasn't been any kind of
// communication for a while, like for about 4-5 seconds", and the host sending it decides how long to wait for the
// answer: "A recommended timeout is about 5 seconds". The client asked every 10 s, whatever came, and closed the
// connection when the answer took more than 500 ms, even while the provider was sending: a provider busy sending a large
// tree on a slow link, or a slow device, lost a working connection.
describe('S101Client keepalives', () => {
	beforeEach(() => {
		jest.useFakeTimers()
	})
	afterEach(() => {
		jest.useRealTimers()
	})

	it('asks only after 5 s in which nothing came', async () => {
		const { client, socket } = connectedClient()
		for (let i = 0; i < 20; i++) {
			socket.emit('data', PROVIDER_MESSAGE)
			await jest.advanceTimersByTimeAsync(1000)
		}
		expect(socket.keepaliveRequests).toBe(0)

		await jest.advanceTimersByTimeAsync(5000) // nothing since 19 s: the request at 24 s
		expect(socket.keepaliveRequests).toBe(1)
		client.removeAllListeners()
		await client.disconnect()
	})

	it.each([
		['its answer', KEEPALIVE_RESPONSE],
		['anything, such as a message the answer is behind', PROVIDER_MESSAGE],
	])('waits 5 s for %s', async (_, reply) => {
		const { client, socket } = connectedClient()
		socket.answerKeepalives = false
		await jest.advanceTimersByTimeAsync(5000)
		expect(socket.keepaliveRequests).toBe(1)

		await jest.advanceTimersByTimeAsync(4000)
		socket.emit('data', reply)
		await jest.advanceTimersByTimeAsync(2000)

		expect(client.status).toBe(ConnectionStatus.Connected)
		expect(socket.destroyed).toBe(false)
		client.removeAllListeners()
		await client.disconnect()
	})

	it('closes the connection when nothing comes for 5 s after asking', async () => {
		const { client, socket } = connectedClient()
		const disconnected = jest.fn()
		client.on('disconnected', disconnected)
		socket.answerKeepalives = false
		await jest.advanceTimersByTimeAsync(5000)
		expect(socket.keepaliveRequests).toBe(1)

		await jest.advanceTimersByTimeAsync(4900)
		expect(disconnected).not.toHaveBeenCalled()
		await jest.advanceTimersByTimeAsync(200)
		expect(disconnected).toHaveBeenCalledTimes(1) // (and the client connects again)
		client.removeAllListeners()
		await client.disconnect()
	})
})

// A connection's keepalive timers were left running when it closed, and a reconnect started more beside them
// (net.Socket connects again as the same socket)
describe('S101Client keepalives across a reconnect', () => {
	beforeEach(() => {
		jest.useFakeTimers()
	})
	afterEach(() => {
		jest.useRealTimers()
	})

	it('keeps asking only as often as before after a reconnect, and stops after disconnect()', async () => {
		const { client, socket } = connectedClient()
		await advanceInSteps(5000)
		expect(socket.keepaliveRequests).toBe(1)

		socket.emit('close', false) // the connection drops, and the client connects again at once
		expect(socket.connecting).toBe(true)
		socket.succeed()
		const before = socket.keepaliveRequests
		await advanceInSteps(30000)
		// a request every 5 s: each is answered at once, and nothing else comes
		expect(socket.keepaliveRequests - before).toBe(6)

		await client.disconnect()
		const atDisconnect = socket.keepaliveRequests
		await advanceInSteps(30000)
		expect(socket.keepaliveRequests).toBe(atDisconnect)
		client.removeAllListeners()
	})

	// The wait for the answer to a request the dropped connection didn't answer closed the next connection
	it("doesn't let an unanswered keepalive of the dropped connection close the next one", async () => {
		const { client, socket } = connectedClient()
		socket.answerKeepalives = false
		await jest.advanceTimersByTimeAsync(5100) // the request at 5 s, unanswered
		expect(socket.keepaliveRequests).toBe(1)

		socket.emit('close', false) // dropped while waiting for the answer
		socket.answerKeepalives = true
		expect(socket.connecting).toBe(true)
		socket.succeed()
		await advanceInSteps(6000) // past the end of the dropped connection's wait

		expect(client.status).toBe(ConnectionStatus.Connected)
		expect(socket.destroyed).toBe(false)
		client.removeAllListeners()
		await client.disconnect()
	})
})

describe('S101Client a new connection', () => {
	beforeEach(() => {
		jest.useFakeTimers()
	})
	afterEach(() => {
		jest.useRealTimers()
	})

	// The codec is the client's, for every connection it makes: what the dropped one left half read was kept. A frame
	// cut short took the next connection's data for the rest of it, and a message in several packets cut short was
	// held (up to 16 MiB) until another came.
	it('starts clean, without what the dropped connection left half read', async () => {
		const client = new S101Client('127.0.0.1', 9000)
		const trees: unknown[] = []
		client.on('error', () => null)
		client.on('emberTree', (tree) => trees.push(tree))
		void client.connect()
		const first = currentSocket(client)
		first.succeed()

		// The first packet of a message in several, and the start of a non-escaping frame of 255 bytes
		first.emit('data', at(new S101Codec().encodeBER(Buffer.alloc(3000, 0x01)), 0))
		first.emit('data', Buffer.from([0xf8, 0x01, 0xff, 0x00]))
		first.emit('close', false)
		await advanceInSteps(5000) // the retry
		const next = currentSocket(client)
		next.succeed()

		const message = berEncode([new NumberedTreeNodeImpl(0, new GetDirectoryImpl())], RootType.Elements)
		next.emit('data', at(new S101Codec().encodeBER(message), 0))

		expect(trees).toHaveLength(1)
		const codec = (client as unknown as { codec: { multiPacketBuffer?: unknown } }).codec
		expect(codec.multiPacketBuffer).toBeUndefined()
		client.removeAllListeners()
		await client.disconnect()
	})
})

describe('S101Client a rejected frame', () => {
	beforeEach(() => {
		jest.useFakeTimers()
	})
	afterEach(() => {
		jest.useRealTimers()
	})

	it('emits one error and still delivers the message after it in the same read', async () => {
		const client = new S101Client('127.0.0.1', 9000)
		const errors: Error[] = []
		const trees: unknown[] = []
		client.on('error', (e) => errors.push(e))
		client.on('emberTree', (tree) => trees.push(tree))
		void client.connect()
		const connection = currentSocket(client)
		connection.succeed()

		const codec = new S101Codec()
		const good = at(
			codec.encodeBER(berEncode([new NumberedTreeNodeImpl(0, new GetDirectoryImpl())], RootType.Elements)),
			0
		)
		const bad = Buffer.from(good)
		bad[good.length - 4] = at(bad, good.length - 4) ^ 0x01 // the last byte before the CRC: the CRC no longer matches (neither byte is BOF, EOF or escape)
		connection.emit('data', Buffer.concat([bad, good]))

		expect(errors.map((e) => e.message)).toEqual([expect.stringMatching(/invalid CRC/)])
		expect(trees).toHaveLength(1)
		expect(client.status).toBe(ConnectionStatus.Connected)

		client.removeAllListeners()
		await client.disconnect()
	})
})

describe('S101Client decoding', () => {
	beforeEach(() => {
		jest.useFakeTimers()
	})
	afterEach(() => {
		jest.useRealTimers()
		jest.mocked(berDecode).mockClear()
	})

	/** A connected client, what it emits, and a way to send it one message (a GetDirectory on the root) */
	function connected() {
		const client = new S101Client('127.0.0.1', 9000)
		const errors: Error[] = []
		const trees: unknown[] = []
		client.on('error', (e) => errors.push(e))
		client.on('emberTree', (tree) => trees.push(tree))
		void client.connect()
		const connection = currentSocket(client)
		connection.succeed()
		const message = berEncode([new NumberedTreeNodeImpl(0, new GetDirectoryImpl())], RootType.Elements)
		const receive = () => connection.emit('data', new S101Codec().encodeBER(message)[0])
		return { client, errors, trees, receive }
	}

	it('decodes each message once', async () => {
		const { client, trees, receive } = connected()
		jest.mocked(berDecode).mockClear()

		receive()

		expect(trees).toHaveLength(1)
		expect(berDecode).toHaveBeenCalledTimes(1)
		client.removeAllListeners()
		await client.disconnect()
	})

	it('reports a message that fails to decode as an error', async () => {
		const { client, errors, trees, receive } = connected()
		const consoleError = jest.spyOn(console, 'error').mockImplementation(() => null)
		jest.mocked(berDecode).mockImplementationOnce(() => {
			throw new Error('cannot decode')
		})

		receive()

		expect(errors.map((e) => e.message)).toEqual(['cannot decode'])
		expect(trees).toEqual([])
		expect(consoleError).not.toHaveBeenCalled()
		consoleError.mockRestore()
		client.removeAllListeners()
		await client.disconnect()
	})
})
