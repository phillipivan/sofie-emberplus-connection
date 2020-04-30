import * as Ber from '../../Ber'
import { StreamDescription, StreamFormat } from '../../model/StreamDescription'

export function encodeStreamDescription(description: StreamDescription, writer: Ber.Writer) {
	writer.startSequence(Ber.APPLICATION(12))

	writer.writeIfDefined(
		description.format && formatToInt(description.format),
		writer.writeInt,
		0,
		Ber.BERDataTypes.INTEGER
	)
	writer.writeIfDefined(description.offset, writer.writeInt, 1, Ber.BERDataTypes.INTEGER)

	writer.endSequence()
}

function formatToInt(format: StreamFormat) {
	const formatToInt = {
		[StreamFormat.UInt8]: 0,
		[StreamFormat.UInt16BE]: 1,
		[StreamFormat.UInt16LE]: 2,
		[StreamFormat.UInt32BE]: 3,
		[StreamFormat.UInt32LE]: 4,
		[StreamFormat.UInt64BE]: 5,
		[StreamFormat.UInt64LE]: 6,
		[StreamFormat.Int8]: 7,
		[StreamFormat.Int16BE]: 8,
		[StreamFormat.Int16LE]: 9,
		[StreamFormat.Int32BE]: 10,
		[StreamFormat.Int32LE]: 11,
		[StreamFormat.Int64BE]: 12,
		[StreamFormat.Int64LE]: 13,
		[StreamFormat.Float32BE]: 14,
		[StreamFormat.Float32LE]: 15,
		[StreamFormat.Float64BE]: 16,
		[StreamFormat.Float64LE]: 17
	}

	return formatToInt[format]
}
