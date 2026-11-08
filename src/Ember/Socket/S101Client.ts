import net from 'net'

import Debug from 'debug'

import { S101OversizedFrameError } from '../../Errors.js'
import { ConnectionStatus } from '../Client/ConnectionStatus.js'
import { normalizeError } from '../Lib/util.js'
import S101Socket from './S101Socket.js'

const debug = Debug('emberplus-connection:S101Client')
debug.log = console.log.bind(console)

const DEFAULT_PORT = 9000
const DEFAULT_CONNECT_TIMEOUT = 5 // seconds
// Retries back off linearly: the first comes 5 s after an attempt, and each one
// after that waits 5 s longer than the one before, up to a minute.
const RECONNECT_DELAY_MIN = 5000
const RECONNECT_DELAY_STEP = 5000
const RECONNECT_DELAY_MAX = 60000

export default class S101Client extends S101Socket {
	address: string
	port: number
	autoConnect = false

	private _autoReconnect = true
	private _reconnectDelay = RECONNECT_DELAY_MIN
	private _connectionAttemptTimer: NodeJS.Timeout | undefined = undefined
	private _shouldBeConnected: boolean
	private _lastConnectionAttempt = 0
	/** The connect() calls still waiting for an attempt to connect or fail, see _settleConnectWaiters */
	private _connectWaiters: Array<(result?: Error) => void> = []

	/**
	 *
	 * @param {string} address
	 * @param {number} port=9000
	 * @param {boolean} autoConnect
	 */
	constructor(address: string, port: number = DEFAULT_PORT, autoConnect?: boolean) {
		super()
		this.address = address
		this.port = port

		this.autoConnect = !!autoConnect
		this._shouldBeConnected = this.autoConnect

		if (this.autoConnect) this.connect().catch(() => null) // errors are already emitted
	}

	/**
	 * Resolves once connected, or with an Error when the attempt fails or disconnect()
	 * comes first. An attempt is only started if the last one started at least
	 * RECONNECT_DELAY_MIN ago; otherwise this settles with the attempt under way, or
	 * with the next retry if that one has failed already.
	 */
	async connect(timeout = DEFAULT_CONNECT_TIMEOUT): Promise<Error | void> {
		return this._connect(timeout, false)
	}

	/**
	 * @param retryDue A scheduled retry: attempt now, without the check that the last
	 * attempt was at least RECONNECT_DELAY_MIN ago. (The retry timer is the schedule;
	 * the check, against the wall clock, could otherwise skip a retry that fires a few
	 * ms early by it.)
	 */
	private async _connect(timeout: number, retryDue: boolean): Promise<Error | void> {
		return new Promise((resolve) => {
			if (this.status !== ConnectionStatus.Disconnected) {
				// TODO - perhaps we should reconnect when addresses/ports have changed
				resolve()
				return
			}
			this._connectWaiters.push(resolve)
			if (
				retryDue ||
				!this._lastConnectionAttempt ||
				Date.now() - this._lastConnectionAttempt >= RECONNECT_DELAY_MIN
			) {
				// !_lastReconnectionAttempt means first attempt, OR > _reconnectionDelay since last attempt
				// recreates client if new attempt
				if (this.socket && this.socket.connecting) {
					this.socket.destroy()
					this.socket.removeAllListeners()
					delete this.socket
					// @todo: fire event telling it gives up!
				}

				// (re)creates client, either on first run or new attempt
				if (!this.socket) {
					this.socket = new net.Socket()
					this.socket.on('close', (hadError) => this._onClose(hadError))
					this.socket.on('connect', () => this._onConnect())
					this.socket.on('data', (chunk) => {
						// no encoding is set on the socket, so this is a Buffer
						const data = typeof chunk === 'string' ? Buffer.from(chunk) : chunk
						debug('Data from Ember connection received:', {
							address: this.socket?.remoteAddress,
							port: this.socket?.remotePort,
							dataLength: data.length,
							data: data.toString('hex'),
						})
						try {
							this.codec.dataIn(data)
						} catch (e) {
							this.emit('error', normalizeError(e))
							if (e instanceof S101OversizedFrameError) {
								// Abusive/broken peer - drop the connection instead of continuing to buffer.
								this.handleClose()
							}
						}
					})
					this.socket.on('error', (error) => this._onError(error))
				}

				this.emit('connecting')
				this.status = ConnectionStatus.Disconnected
				// The timeout belongs to this attempt only: it is cleared when the attempt
				// connects or closes, and never touches a socket a later attempt is using.
				// A timeout left running for an attempt that has ended or been replaced
				// (a retry replaces a socket that is still connecting) would otherwise
				// destroy the current socket when it fires, even a live connection, and
				// remove its listeners, so the client would go on reporting "connected".
				// Likewise only the current attempt settles the connect() calls waiting:
				// those of a replaced attempt now wait for the one that replaced it, and
				// once disconnect() has abandoned an attempt (and settled the calls
				// waiting then), a connect() since then waits for the next attempt.
				const socket = this.socket
				const onConnect = () => {
					clearTimeout(timer)
					socket.off('close', onClose)
					this._settleConnectWaiters()
				}
				const onClose = () => {
					clearTimeout(timer)
					socket.off('connect', onConnect)
					if (this.socket === socket) {
						this._settleConnectWaiters(new Error(`Could not connect to ${this.address}:${this.port}`))
					}
				}
				const connectTimeoutListener = () => {
					socket.off('connect', onConnect)
					socket.off('close', onClose)
					if (this.socket === socket) {
						socket.destroy()
						socket.removeAllListeners()
						delete this.socket
						this._settleConnectWaiters(
							new Error(
								`Could not connect to ${this.address}:${this.port} after a timeout of ${timeout} seconds`
							)
						)
					}
					if (this._shouldBeConnected && !this._connectionAttemptTimer) this.connect().catch(() => null)
				}

				const timer = setTimeout(() => connectTimeoutListener(), timeout * 1000)
				socket.once('connect', onConnect)
				socket.once('close', onClose)
				socket.connect(this.port, this.address)
				this._shouldBeConnected = true
				this._lastConnectionAttempt = Date.now()
			}

			// sets timer to retry when needed
			if (!this._connectionAttemptTimer) {
				this._connectionAttemptTimer = setTimeout(() => this._autoReconnectionAttempt(), this._reconnectDelay)
			}
		})
	}

	async disconnect(timeout?: number): Promise<void> {
		// Stop reconnecting too, connected or not: otherwise the retry interval
		// and an attempt in flight carry on (and may connect) after the client
		// has been disconnected or discarded.
		this._shouldBeConnected = false
		this._clearConnectionAttemptTimer()
		// no attempt will come now for the connect() calls still waiting
		this._settleConnectWaiters(new Error(`Disconnected before connecting to ${this.address}:${this.port}`))
		if (this.socket?.connecting) {
			const pending = this.socket
			delete this.socket
			pending.destroy()
		}
		return super.disconnect(timeout)
	}

	protected handleClose(): void {
		if (this.keepaliveIntervalTimer) clearInterval(this.keepaliveIntervalTimer)
		this.socket?.destroy()
	}

	/**
	 * Retry for as long as the client is meant to be connected: disconnect()
	 * stops the retries. (A cap on attempts would leave a client that gave up
	 * disconnected for good, with nothing to tell the caller.) Each retry waits
	 * RECONNECT_DELAY_STEP longer than the one before, up to RECONNECT_DELAY_MAX.
	 */
	private _autoReconnectionAttempt(): void {
		delete this._connectionAttemptTimer
		this._reconnectDelay = Math.min(this._reconnectDelay + RECONNECT_DELAY_STEP, RECONNECT_DELAY_MAX)
		if (this._autoReconnect && this.status !== ConnectionStatus.Connected) {
			// also schedules the next retry
			this._connect(DEFAULT_CONNECT_TIMEOUT, true).catch(() => null)
		}
	}

	/**
	 * Settles every connect() call still waiting: with nothing once connected, or
	 * with the Error that ended the attempt. Each call waits here, whether it
	 * started an attempt or not, so a call that couldn't start one (see connect())
	 * settles with the attempt under way or the next retry.
	 */
	private _settleConnectWaiters(result?: Error): void {
		const waiters = this._connectWaiters
		this._connectWaiters = []
		for (const resolve of waiters) resolve(result)
	}

	/** Stops the retries; the next ones (after a connection or disconnect()) start over from RECONNECT_DELAY_MIN. */
	private _clearConnectionAttemptTimer() {
		// @todo create event telling reconnection ended with result: true/false
		// only if reconnection interval is true
		if (this._connectionAttemptTimer) clearTimeout(this._connectionAttemptTimer)
		delete this._connectionAttemptTimer
		this._reconnectDelay = RECONNECT_DELAY_MIN
	}

	private _onConnect() {
		this._clearConnectionAttemptTimer()
		this.startKeepAlive()
		// this._sentKeepalive = Date.now()
		// this._receivedKeepalive = this._sentKeepalive + 1 // for some reason keepalive doesn't return directly after conn.
		this.status = ConnectionStatus.Connected
		this.emit('connected')
	}

	private _onError(error: Error) {
		if (error.message.match(/ECONNREFUSED/)) {
			return // we handle this internally through reconnections
		}
		this.emit('error', error)
	}

	private _onClose(_hadError: boolean) {
		if (this.status !== ConnectionStatus.Disconnected) this.emit('disconnected')
		this.status = ConnectionStatus.Disconnected

		if (this._shouldBeConnected === true) {
			this.emit('connecting')
			this.connect().catch(() => null)
		}
	}
}
