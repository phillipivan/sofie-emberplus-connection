import net, { AddressInfo, Socket } from 'net'

import type { MockInstance } from 'vitest'

import { EmberClient } from '../../Client/index.js'
import { EmberServer } from '../../Server/index.js'
import { S101Server } from '../S101Server.js'

// TCP_NODELAY over real connections on 127.0.0.1. Node can't read the option back, so the tests follow
// net.Socket.prototype.setNoDelay: which socket each call was on, and with what.
describe('setNoDelay', () => {
	let setNoDelay: MockInstance<Socket['setNoDelay']>
	let server: EmberServer | undefined
	let client: EmberClient | undefined
	/** The provider's ends of the consumers' connections, as they came */
	let accepted: Socket[] = []

	beforeEach(() => {
		setNoDelay = vi.spyOn(net.Socket.prototype, 'setNoDelay')
		accepted = []
	})
	afterEach(async () => {
		await client?.disconnect()
		client?.discard()
		client = undefined
		for (const socket of accepted) socket.destroy()
		server?.discard()
		server = undefined
		setNoDelay.mockRestore()
	})

	/** A provider listening on a free port of 127.0.0.1, noting each connection's socket */
	async function listening(): Promise<{ provider: EmberServer; port: number }> {
		const provider = new EmberServer(0, '127.0.0.1')
		server = provider
		await provider.init(new Map())
		const s101 = (provider as unknown as { _server: S101Server })._server
		s101.server?.on('connection', (socket: Socket) => accepted.push(socket))
		return { provider, port: (s101.server?.address() as AddressInfo).port }
	}

	/** What setNoDelay was last given on a socket, if it was called on it */
	function lastNoDelay(socket: Socket | undefined): boolean | undefined {
		const calls = setNoDelay.mock.calls.filter((_, i) => setNoDelay.mock.contexts[i] === socket)
		return calls.length ? (calls.at(-1)?.[0] ?? true) : undefined
	}

	/** The client's socket to the provider, as it is now */
	const clientSocket = (from: EmberClient) => (from as unknown as { _client: { socket?: Socket } })._client.socket

	/** Waits for a condition, checking at each turn of the event loop, for up to 5 s */
	async function until(condition: () => boolean): Promise<void> {
		const end = Date.now() + 5000
		while (!condition()) {
			if (Date.now() > end) throw new Error('Timed out')
			await new Promise((resolve) => setTimeout(resolve, 5))
		}
	}

	it("isn't set on a client's connection unless asked for", async () => {
		const { port } = await listening()
		client = new EmberClient('127.0.0.1', port)
		await client.connect()

		expect(lastNoDelay(clientSocket(client))).not.toBe(true)
	})

	// (a reconnect, which makes a new socket, is in S101Client.spec.ts, with fake timers)
	it("is set on a client's connection when asked for before connecting", async () => {
		const { port } = await listening()
		client = new EmberClient('127.0.0.1', port)
		client.setNoDelay(true)
		await client.connect()

		expect(lastNoDelay(clientSocket(client))).toBe(true)
	})

	it("is set and cleared on a client's connection while connected", async () => {
		const { port } = await listening()
		client = new EmberClient('127.0.0.1', port)
		await client.connect()

		client.setNoDelay(true)
		expect(lastNoDelay(clientSocket(client))).toBe(true)
		client.setNoDelay(false)
		expect(lastNoDelay(clientSocket(client))).toBe(false)
	})

	it("is set on a provider's connections, those it has and those to come", async () => {
		const { provider, port } = await listening()
		const before = new EmberClient('127.0.0.1', port)
		client = before
		await before.connect()
		await until(() => accepted.length === 1)

		provider.setNoDelay(true)
		expect(lastNoDelay(accepted[0])).toBe(true)

		const later = new EmberClient('127.0.0.1', port)
		try {
			await later.connect()
			await until(() => accepted.length === 2)
			expect(lastNoDelay(accepted[1])).toBe(true)

			provider.setNoDelay(false)
			expect(lastNoDelay(accepted[0])).toBe(false)
			expect(lastNoDelay(accepted[1])).toBe(false)
		} finally {
			await later.disconnect()
			later.discard()
		}
	})
})
