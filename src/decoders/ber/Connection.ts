import { Connection, ConnectionOperation, ConnectionDisposition, ConnectionImpl } from '../../model/Connection'
import * as Ber from '../../Ber'

const ConnectionBERID = Ber.APPLICATION(16)

export function decodeConnection(reader: Ber.Reader): Connection {
	const ber = reader.getSequence(ConnectionBERID)
	let target: number | null = null
	let sources: Array<number> | undefined = undefined
	let operation: ConnectionOperation | undefined = undefined
	let disposition: ConnectionDisposition | undefined = undefined
	while (ber.remain > 0) {
		const tag = ber.peek()
		const seq = ber.getSequence(tag!)
		switch (tag) {
			case Ber.CONTEXT(0):
				target = seq.readInt()
				break
			case Ber.CONTEXT(1):
				const encodedSources = seq.readRelativeOID(Ber.BERDataTypes.RELATIVE_OID)
				if (encodedSources.length === 0) {
					sources = []
				} else {
					sources = encodedSources.split('.').map(i => Number(i))
				}
			  break
			case Ber.CONTEXT(2):
				operation = readConnectionOperation(seq.readInt())
			  break
			case Ber.CONTEXT(3):
				disposition = readConnectionDisposition(seq.readInt())
				break
			default:
			  throw new Error(``)
		}

	}
	if (target === null) {
		throw new Error(``)
	}
	return new ConnectionImpl(target, sources, operation, disposition)
}

function readConnectionOperation(value: number): ConnectionOperation {
	switch (value) {
		case 0: return ConnectionOperation.Absolute
		case 1: return ConnectionOperation.Connect
		case 2: return ConnectionOperation.Disconnect
		default:
			throw new Error(``)
	}
}

function readConnectionDisposition(value: number): ConnectionDisposition {
	switch (value) {
		case 0: return ConnectionDisposition.Tally
		case 1: return ConnectionDisposition.Modified
		case 2: return ConnectionDisposition.Pending
		case 3: return ConnectionDisposition.Locked
		default:
			throw new Error(``)
	}
}
