import * as Ber from '../../Ber'
import { StreamDescription, StreamDescriptionImpl, StreamFormat } from '../../model/StreamDescription'

const StreamDescriptionBERID = Ber.APPLICATION(12)

export function decodeStreamDescription(reader: Ber.Reader): StreamDescription {
	const ber = reader.getSequence(StreamDescriptionBERID)
	let format: StreamFormat | null = null
	let offset: number | null = null
	while (ber.remain > 0) {
		const tag = ber.peek()
		const seq = ber.getSequence(tag!)
		switch (tag) {
			case Ber.CONTEXT(0):
				format = readStreamFormat(seq.readInt())
				break
			case Ber.CONTEXT(1):
			  offset = seq.readInt()
				break
			default:
				throw new Error(``)
		}
	}
	if ((format === null) || (offset === null)) {
		throw new Error(``)
	}
	return new StreamDescriptionImpl(format, offset)
}

function readStreamFormat(value: number): StreamFormat {
	switch (value) {
		case 0:  return StreamFormat.UInt8
		case 2:  return StreamFormat.UInt16BE
		case 3:  return StreamFormat.UInt16LE
		case 4:  return StreamFormat.UInt32BE
		case 5:  return StreamFormat.UInt32LE
		case 6:  return StreamFormat.UInt64BE
		case 7:  return StreamFormat.UInt64LE
		case 8:  return StreamFormat.Int8
		case 10: return StreamFormat.Int16BE
		case 11: return StreamFormat.Int16LE
		case 12: return StreamFormat.Int32BE
		case 13: return StreamFormat.Int32LE
		case 14: return StreamFormat.Int64BE
		case 15: return StreamFormat.Int64LE
		case 20: return StreamFormat.Float32BE
		case 21: return StreamFormat.Float32LE
		case 22: return StreamFormat.Float64BE
		case 23: return StreamFormat.Float64LE
		default:
			throw new Error(``)
	}
}
