import * as Ber from '../../Ber'
import { StreamEntry, StreamEntryImpl } from '../../model/StreamEntry'
import { EmberTypedValue } from '../../types/types'

const StreamEntryBERID = 5

export function decodeStreamEntry(reader: Ber.Reader): StreamEntry {
	const ber = reader.getSequence(StreamEntryBERID)
	let identifier: number | null = null
	let value: EmberTypedValue | null = null
	while (ber.remain > 0) {
		const tag = ber.peek()
		const seq = ber.getSequence(tag!)
		switch (tag) {
			case Ber.CONTEXT(0):
				identifier = seq.readInt()
				break
			case Ber.CONTEXT(1):
				value = seq.readValue()
				break
			default:
				throw new Error(``)
		}
 	}
	if ((identifier === null) || (value === null)) {
		throw new Error(``)
	}
	return new StreamEntryImpl(identifier, value)
}
