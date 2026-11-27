import { createServer, Server, Socket } from 'net'
import { format } from 'util'

import { EventEmitter } from 'eventemitter3'

import S101Socket from './S101Socket.js'

/**
 * Bytes waiting to be sent to a consumer above which its connection is closed. A reply to a GetDirectory is one level
 * of the tree, and the kernel's send buffer fills before Node's starts to: this much waiting means the consumer has
 * stopped reading.
 */
const DEFAULT_MAX_SEND_BUFFER_SIZE = 8 * 1024 * 1024

/**
 * Consumers connected at once, beyond which a connection is refused. A provider rarely has more than a dozen; each
 * connection can hold some 28 MiB at most (a frame cut short, a message in several packets, what waits to be sent), so
 * this bounds what consumers can take to under 2 GB.
 */
const DEFAULT_MAX_CLIENTS = 64

/**
 * How long a consumer's connection may be idle before the system's TCP keep-alive probes start. They notice a consumer
 * that is gone (after some minutes, as the system sets them) whether keep-alive requests are sent or not.
 */
const TCP_KEEPALIVE_DELAY = 60000

export interface S101ServerOptions {
	/**
	 * Bytes waiting to be sent to a consumer above which its connection is closed (with an S101SendBufferFullError, as
	 * the socket's error): it isn't reading what is sent to it. The consumer connects again and asks for the tree
	 * again. 8 MiB by default; Infinity sets no limit.
	 */
	maxSendBufferSize?: number
	/**
	 * Consumers connected at once, beyond which a connection is refused (closed as soon as it is made), with a
	 * 'refused' event (EmberServer's 'warn'). 64 by default; Infinity sets no limit.
	 */
	maxClients?: number
	/**
	 * Whether to send each consumer keep-alive requests, as a client does: one when nothing has come for 5 s, the
	 * connection closed when nothing comes in the 5 s after. A consumer gone without closing its connection is so
	 * noticed in about 10 s. Every Ember+ host must answer one (the documentation's Keep-Alive mechanism); turn this off
	 * for a consumer that doesn't. On by default. (TCP keep-alive is on either way, noticing such a consumer in minutes.)
	 */
	keepalive?: boolean
}

export type S101ServerEvents = {
	error: [Error]
	listening: []
	connection: [client: S101Socket]
	/** A connection refused, and why: as many consumers are connected as maxClients allows */
	refused: [Error]
}
export class S101Server extends EventEmitter<S101ServerEvents> {
	port: number
	address: string | undefined
	server: Server | null
	status: string // TODO - enum
	private readonly maxSendBufferSize: number
	private readonly maxClients: number
	private readonly keepalive: boolean
	/** TCP_NODELAY for the consumers' connections from now on, see setNoDelay */
	private noDelay = false

	constructor(port: number, address?: string, options?: S101ServerOptions) {
		super()
		this.port = port
		this.address = address
		this.server = null
		this.status = 'disconnected'
		this.maxSendBufferSize = options?.maxSendBufferSize ?? DEFAULT_MAX_SEND_BUFFER_SIZE
		this.maxClients = options?.maxClients ?? DEFAULT_MAX_CLIENTS
		this.keepalive = options?.keepalive ?? true
	}

	addClient(socket: Socket): void {
		socket.setKeepAlive(true, TCP_KEEPALIVE_DELAY)
		// Wrap the tcp socket into an S101Socket.
		const client = new S101Socket(socket, {
			maxSendBufferSize: this.maxSendBufferSize,
			keepalive: this.keepalive,
			noDelay: this.noDelay,
		})
		this.emit('connection', client)
	}

	/** TCP_NODELAY (see S101Socket.setNoDelay) for the consumers that connect from now on */
	setNoDelay(noDelay = true): void {
		this.noDelay = noDelay
	}

	async listen(): Promise<void> {
		return new Promise((resolve, reject) => {
			if (this.status !== 'disconnected') {
				return reject(new Error('Already listening'))
			}
			this.server = createServer((socket) => {
				this.addClient(socket)
			})
				.on('error', (e) => {
					this.emit('error', e)
					if (this.status === 'disconnected') {
						return reject(e)
					}
				})
				.on('listening', () => {
					this.emit('listening')
					this.status = 'listening'
					resolve(undefined)
				})
			// Node closes a connection beyond maxConnections as soon as it is made, and says so with 'drop'
			this.server.maxConnections = this.maxClients
			this.server.on('drop', (connection) => {
				const refused = format(
					'connection from %s:%s refused: %d consumers are connected, as many as maxClients allows',
					connection?.remoteAddress,
					connection?.remotePort,
					this.maxClients
				)
				this.emit('refused', new Error(refused))
			})
			this.server.listen(this.port, this.address)
		})
	}

	discard(): void {
		this.server?.close()
	}
}
