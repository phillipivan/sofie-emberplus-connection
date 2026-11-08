import { EventEmitter } from 'events'

import S101Codec from '../../../S101/S101Codec.js'
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
		if (data.equals(KEEPALIVE_REQUEST)) queueMicrotask(() => this.emit('data', KEEPALIVE_RESPONSE))
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
	return times.slice(1).map((time, i) => time - times[i])
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
})
