import { createServer, Server, Socket } from 'net'

import { EventEmitter } from 'eventemitter3'

import S101Socket from './S101Socket.js'

/**
 * Bytes waiting to be sent to a consumer above which its connection is closed. A reply to a GetDirectory is one level
 * of the tree, and the kernel's send buffer fills before Node's starts to: this much waiting means the consumer has
 * stopped reading.
 */
const DEFAULT_MAX_SEND_BUFFER_SIZE = 8 * 1024 * 1024

export interface S101ServerOptions {
	/**
	 * Bytes waiting to be sent to a consumer above which its connection is closed (with an S101SendBufferFullError, as
	 * the socket's error): it isn't reading what is sent to it. The consumer connects again and asks for the tree
	 * again. 8 MiB by default; Infinity sets no limit.
	 */
	maxSendBufferSize?: number
}

export type S101ServerEvents = {
	error: [Error]
	listening: []
	connection: [client: S101Socket]
}
export class S101Server extends EventEmitter<S101ServerEvents> {
	port: number
	address: string | undefined
	server: Server | null
	status: string // TODO - enum
	private readonly maxSendBufferSize: number

	constructor(port: number, address?: string, options?: S101ServerOptions) {
		super()
		this.port = port
		this.address = address
		this.server = null
		this.status = 'disconnected'
		this.maxSendBufferSize = options?.maxSendBufferSize ?? DEFAULT_MAX_SEND_BUFFER_SIZE
	}

	addClient(socket: Socket): void {
		// Wrap the tcp socket into an S101Socket.
		const client = new S101Socket(socket, { maxSendBufferSize: this.maxSendBufferSize })
		this.emit('connection', client)
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
			this.server.listen(this.port, this.address)
		})
	}

	discard(): void {
		this.server?.close()
	}
}
