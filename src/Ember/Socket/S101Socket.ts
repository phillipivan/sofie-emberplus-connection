import { Socket } from 'net'
import { format } from 'util'

import { EventEmitter } from 'eventemitter3'

import { berDecode, DecodedRoot } from '../../encodings/ber/index.js'
import { S101OversizedFrameError, S101SendBufferFullError } from '../../Errors.js'
import { S101Codec } from '../../S101/index.js'
import { ConnectionStatus } from '../Client/ConnectionStatus.js'
import { normalizeError } from '../Lib/util.js'

export type S101SocketEvents = {
	error: [Error]
	emberTree: [root: DecodedRoot]
	emberStreamTree: [root: DecodedRoot]
	connecting: []
	connected: []
	disconnected: []
}

// The Ember+ documentation, Keep-Alive mechanism: a request "should only be sent when there hasn't been any kind of
// communication for a while, like for about 4-5 seconds", and the host sending it decides how long to wait for the
// answer: "A recommended timeout is about 5 seconds". (Every host must answer one.)
/** How long nothing may come before a keep-alive request is sent */
const KEEPALIVE_IDLE_TIME = 5000
/** How long to wait for anything to come after one, before closing the connection */
const KEEPALIVE_TIMEOUT = 5000

export interface S101SocketOptions {
	/**
	 * Bytes waiting to be sent to the peer above which the connection is closed, with an S101SendBufferFullError: the
	 * peer isn't reading what is sent to it, which would otherwise be kept without end. No limit by default.
	 */
	maxSendBufferSize?: number
}

export default class S101Socket extends EventEmitter<S101SocketEvents> {
	protected socket: Socket | undefined
	private readonly maxSendBufferSize: number
	/** Waits for the time to send a keep-alive request, or, once one is sent, for the time to have had an answer */
	private keepaliveTimer: NodeJS.Timeout | undefined
	/** When anything last came from the peer */
	private lastReceived = 0
	/** Whether anything came since the last keep-alive request */
	private receivedSinceRequest = false
	status: ConnectionStatus
	protected readonly codec = new S101Codec()

	constructor(socket?: Socket, options?: S101SocketOptions) {
		super()
		this.socket = socket
		this.maxSendBufferSize = options?.maxSendBufferSize ?? Infinity
		this.status = this.isConnected() ? ConnectionStatus.Connected : ConnectionStatus.Disconnected

		// A request in a non-escaping frame is answered in one, so the peer learns this side reads them
		this.codec.on('keepaliveReq', (nonEscaping) => {
			this.sendKeepaliveResponse(nonEscaping)
		})

		this.codec.on('emberPacket', (packet) => {
			try {
				const root = berDecode(packet)
				if (root != null) {
					this.emit('emberTree', root)
				}
			} catch (e) {
				this.emit('error', normalizeError(e))
			}
		})
		this.codec.on('emberStreamPacket', (packet) => {
			try {
				const root = berDecode(packet)
				if (root != null) {
					this.emit('emberStreamTree', root)
				}
			} catch (e) {
				this.emit('error', normalizeError(e))
			}
		})

		this._initSocket()
	}

	private _initSocket(): void {
		if (this.socket != null) {
			this.socket.on('data', (data) => {
				this.noteReceived()
				try {
					// no encoding is set on the socket, so this is a Buffer
					this.codec.dataIn(typeof data === 'string' ? Buffer.from(data) : data)
				} catch (e) {
					this.emit('error', normalizeError(e))
					if (e instanceof S101OversizedFrameError) {
						// Abusive/broken peer - drop the connection instead of continuing to buffer.
						this.socket?.destroy()
					}
				}
			})

			this.socket.on('close', () => {
				this.status = ConnectionStatus.Disconnected
				this.codec.reset()
				this.clearKeepaliveTimers()
				this.socket?.removeAllListeners()
				this.socket = undefined
				this.emit('disconnected')
			})

			this.socket.on('error', (e) => {
				this.emit('error', e)
			})
		}
	}

	/**
	 * @param {number} timeout=2
	 */
	async disconnect(timeout = 2): Promise<void> {
		if (!this.isConnected() || this.socket === undefined) {
			return Promise.resolve()
		}
		return new Promise((resolve) => {
			this.clearKeepaliveTimers()
			if (this.socket) {
				let done = false
				const cb = () => {
					if (done) {
						return
					}
					done = true
					if (timer !== undefined) {
						clearTimeout(timer)
						timer = undefined
					}
					resolve()
				}
				let timer: NodeJS.Timeout | undefined
				if (timeout != null && !isNaN(timeout) && timeout > 0) {
					timer = setTimeout(cb, 100 * timeout)
				}
				this.socket.end(cb)
			}
			this.status = ConnectionStatus.Disconnected
		})
	}

	/**
	 *
	 */
	protected handleClose(): void {
		this.socket?.removeAllListeners()
		this.socket?.destroy()
		this.socket = undefined
		this.clearKeepaliveTimers()
		this.status = ConnectionStatus.Disconnected
		this.emit('disconnected')
	}

	private isConnected(): boolean {
		return this.socket !== undefined && !!this.socket
	}

	sendBER(data: Buffer): boolean {
		if (this.isConnected() && this.socket) {
			try {
				const frames = this.codec.encodeBER(data)
				for (const frame of frames) {
					this.socket.write(frame)
				}
			} catch (_e) {
				this.handleClose()
				return false
			}
			// Closed rather than the message dropped, so that a peer is never left with a tree it thinks is current: it
			// connects again, and asks for the tree again
			const waiting = this.socket.writableLength
			if (waiting > this.maxSendBufferSize) {
				this.emit(
					'error',
					new S101SendBufferFullError(
						format(
							'closing connection: %d bytes are waiting to be sent, more than the maxSendBufferSize of %d',
							waiting,
							this.maxSendBufferSize
						)
					)
				)
				this.handleClose()
				return false
			}
			return true
		} else {
			return false
		}
	}

	/** Whether the request was sent: the connection is closed when it can't be */
	private sendKeepaliveRequest(): boolean {
		if (!this.isConnected() || !this.socket) return false
		try {
			this.socket.write(this.codec.keepAliveRequest())
			return true
		} catch (_e) {
			this.handleClose()
			return false
		}
	}

	/**
	 *
	 */
	private sendKeepaliveResponse(nonEscaping: boolean): void {
		if (this.isConnected() && this.socket) {
			try {
				this.socket.write(this.codec.keepAliveResponse(nonEscaping))
			} catch (_e) {
				this.handleClose()
			}
		}
	}

	// sendBERNode(node: Root) {
	// 	if (!node) return
	// 	const ber = berEncode(node)
	// 	this.sendBER(ber)
	// }

	/**
	 * Anything that comes from the peer shows it is there: no keep-alive request is needed until nothing has come for a
	 * while, and it answers one sent (an answer may be behind what the peer is sending)
	 */
	protected noteReceived(): void {
		this.lastReceived = Date.now()
		this.receivedSinceRequest = true
	}

	/** Stops the keep-alive requests, and the wait for the answer to one sent */
	protected clearKeepaliveTimers(): void {
		if (this.keepaliveTimer) {
			clearTimeout(this.keepaliveTimer)
			this.keepaliveTimer = undefined
		}
	}

	/** Sends a keep-alive request whenever nothing has come for KEEPALIVE_IDLE_TIME, for as long as the peer answers */
	protected startKeepAlive(): void {
		// One wait at a time: requests sent from two would close the connection when an answer came for only one
		this.clearKeepaliveTimers()
		this.lastReceived = Date.now()
		this.keepaliveTimer = setTimeout(() => this.keepaliveDue(), KEEPALIVE_IDLE_TIME)
	}

	/** Sends a keep-alive request if nothing has come for KEEPALIVE_IDLE_TIME, or waits until nothing has */
	private keepaliveDue(): void {
		const idle = Date.now() - this.lastReceived
		if (idle < KEEPALIVE_IDLE_TIME) {
			this.keepaliveTimer = setTimeout(() => this.keepaliveDue(), KEEPALIVE_IDLE_TIME - idle)
			return
		}
		this.receivedSinceRequest = false
		if (!this.sendKeepaliveRequest()) return
		this.keepaliveTimer = setTimeout(() => {
			if (this.receivedSinceRequest) this.keepaliveDue()
			else this.handleClose()
		}, KEEPALIVE_TIMEOUT)
	}
}
