import { EventEmitter } from 'eventemitter3'
import { Socket } from 'net'

import { S101Codec } from '../../S101/index.js'
import { berDecode } from '../../encodings/ber/index.js'
import { ConnectionStatus } from '../Client/index.js'
import { normalizeError } from '../Lib/util.js'
import { Root } from '../../types/index.js'
import { DecodeResult } from '../../encodings/ber/decoder/DecodeResult.js'

export type Request = any

export type S101SocketEvents = {
	error: [Error]
	emberTree: [root: DecodeResult<Root>]
	emberStreamTree: [root: DecodeResult<Root>]
	connecting: []
	connected: []
	disconnected: []
}

export default class S101Socket extends EventEmitter<S101SocketEvents> {
	protected socket: Socket | undefined
	private readonly keepaliveInterval = 10
	private readonly keepaliveMaxResponseTime = 500
	protected keepaliveIntervalTimer: NodeJS.Timeout | undefined
	private keepaliveResponseWindowTimer: NodeJS.Timer | null
	status: ConnectionStatus
	protected readonly codec = new S101Codec()

	constructor(socket?: Socket) {
		super()
		this.socket = socket
		this.keepaliveIntervalTimer = undefined
		this.keepaliveResponseWindowTimer = null
		this.status = this.isConnected() ? ConnectionStatus.Connected : ConnectionStatus.Disconnected

		this.codec.on('keepaliveReq', () => {
			this.sendKeepaliveResponse()
		})

		this.codec.on('keepaliveResp', () => {
			clearInterval(<NodeJS.Timeout>this.keepaliveResponseWindowTimer)
		})

		this.codec.on('emberPacket', (packet: any) => {
			try {
				const root = berDecode(packet)
				if (root != null) {
					this.emit('emberTree', root)
				}
			} catch (e) {
				this.emit('error', normalizeError(e))
			}
		})
		this.codec.on('emberStreamPacket', (packet: any) => {
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
				try {
					this.codec.dataIn(data)
				} catch (e) {
					this.emit('error', normalizeError(e))
				}
			})

			this.socket.on('close', () => {
				this.emit('disconnected')
				this.status = ConnectionStatus.Connected
				this.socket?.removeAllListeners()
				this.socket = undefined
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
			if (this.keepaliveIntervalTimer != null) {
				clearInterval(this.keepaliveIntervalTimer)
				this.keepaliveIntervalTimer = undefined
			}
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
		this.socket = undefined
		if (this.keepaliveIntervalTimer) clearInterval(this.keepaliveIntervalTimer)
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
				for (let i = 0; i < frames.length; i++) {
					this.socket.write(frames[i])
				}
				return true
			} catch (_e) {
				this.handleClose()
				return false
			}
		} else {
			return false
		}
	}

	/**
	 *
	 */
	private sendKeepaliveRequest(): void {
		if (this.isConnected() && this.socket) {
			try {
				this.socket.write(this.codec.keepAliveRequest())
				this.keepaliveResponseWindowTimer = setTimeout(() => {
					this.handleClose()
				}, this.keepaliveMaxResponseTime)
			} catch (_e) {
				this.handleClose()
			}
		}
	}

	/**
	 *
	 */
	private sendKeepaliveResponse(): void {
		if (this.isConnected() && this.socket) {
			try {
				this.socket.write(this.codec.keepAliveResponse())
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

	protected startKeepAlive(): void {
		this.keepaliveIntervalTimer = setInterval(() => {
			try {
				this.sendKeepaliveRequest()
			} catch (e) {
				this.emit('error', normalizeError(e))
			}
		}, 1000 * this.keepaliveInterval)
	}
}
