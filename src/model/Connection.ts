export { Connection, ConnectionDisposition, ConnectionOperation, ConnectionImpl, isConnection }

/** How to interpret the set of sources in a connection. */
enum ConnectionOperation {
	/** List of sources is absolute. Default. Set on tally for all responses from a provider. */
	Absolute = 'ABSOLUTE',
	/** Consumer request that the sources should be connected to the target. */
	Connect = 'CONNECT',
	/** Consumer requests that the sources should be disconnected from the target. */
	Disconnect = 'DISCONNECT',
}

/** Execution state of a connection operation. */
enum ConnectionDisposition {
	/** Sources is the absolute set of current connections. */
	Tally = 'TALLY',
	/** Connection has changed. Sources property contains absolute set of current connections. */
	Modified = 'MODIFIED',
	/** Connect operation queued and connection is not yet current. */
	Pending = 'PENDING',
	/** Connect operation not executed as the target is locked.
	 *  Sources property contains absolute set of current connections. */
	Locked = 'LOCKED',
}

/**
 *  Description of, or details of request and response to connect or disconnect
 *  a target to some sources.
 */
interface Connection {
	/** Number of the element targeted by the connection. */
	target: number
	/** Numbers of all sources connected to the target. If omitted, there are no active connections. */
	sources?: Array<number>
	/** How to interpret the set of sources. */
	operation?: ConnectionOperation
	/** Indicates the execution state of an connection operation. Response from providers only. */
	disposition?: ConnectionDisposition
}

class ConnectionImpl implements Connection {
	constructor(
		public target: number,
		public sources?: Array<number>,
		public operation?: ConnectionOperation,
		public disposition?: ConnectionDisposition
	) {}
}

/**
 * Whether a value is a connection: a numeric target, and sources, an operation and a disposition, if any, of their
 * kinds. For a value from a caller that doesn't check types.
 */
function isConnection(value: unknown): value is Connection {
	if (typeof value !== 'object' || value === null) return false
	if (!('target' in value) || typeof value.target !== 'number') return false
	const isOneOf = (values: Record<string, string>, v: unknown) =>
		v === undefined || (typeof v === 'string' && Object.values<string>(values).includes(v))
	return (
		(!('sources' in value) ||
			value.sources === undefined ||
			(Array.isArray(value.sources) && value.sources.every((source: unknown) => typeof source === 'number'))) &&
		(!('operation' in value) || isOneOf(ConnectionOperation, value.operation)) &&
		(!('disposition' in value) || isOneOf(ConnectionDisposition, value.disposition))
	)
}
