import net from 'net'
import S101Socket from './S101Socket'

const DEFAULT_PORT = 9000

export default class S101Client extends S101Socket {
	address: string
	port: number

	/**
	 *
	 * @param {string} address
	 * @param {number} port=9000
	 */
	constructor(address: string, port = DEFAULT_PORT) {
		super()
		this.address = address
		this.port = port
	}

	connect(timeout = 2) {
		if (this.status !== 'disconnected') {
			return
		}
		this.emit('connecting')
		const connectTimeoutListener = () => {
			if (this.socket) this.socket.destroy()
			this.emit(
				'error',
				new Error(
					`Could not connect to ${this.address}:${this.port} after a timeout of ${timeout} seconds`
				)
			)
		}

		this.socket = net
			.createConnection(
				{
					port: this.port,
					host: this.address
					// timeout: 1000 * timeout
				},
				() => {
					// Disable connect timeout to hand-over to keepalive mechanism
					if (this.socket) this.socket.removeListener('timeout', connectTimeoutListener)
					if (this.socket) this.socket.setTimeout(0)
					this.startKeepAlive()
					this.emit('connected')
				}
			)
			.once('timeout', connectTimeoutListener)
		this._initSocket()
	}
}
