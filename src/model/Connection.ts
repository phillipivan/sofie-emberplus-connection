export { Connection, ConnectionDisposition, ConnectionOperation }

enum ConnectionOperation {
	Absolute = 'ABSOLUTE', // default. sources contains absolute information
	Connect = 'CONNECT', // nToN only. sources contains sources to add to connection
	Disconnect = 'DISCONNECT' // nToN only. sources contains sources to remove from connection
}

enum ConnectionDisposition {
	Tally = 'TALLY',
	Modified = 'MODIFIED',
	Pending = 'PENDING',
	Locked = 'LOCKED'
}

interface Connection {
	target: number // Integer32
	sources?: Array<number> // Integer32s
	operation?: ConnectionOperation
	disposition?: ConnectionDisposition
}

export class ConnectionImpl implements Connection {
	constructor(
		public target: number,
		public sources?: Array<number>,
		public operation?: ConnectionOperation,
		public disposition?: ConnectionDisposition
	) { }
}
