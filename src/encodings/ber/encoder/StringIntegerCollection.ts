import * as Ber from '../../../Ber'
import { StringIntegerCollection } from '../../../types/types'

export function encodeStringIntegerCollection(
	collection: StringIntegerCollection,
	writer: Ber.Writer
) {
	writer.startSequence(Ber.APPLICATION(8))
	for (let [key, value] of collection) {
		writer.startSequence(Ber.CONTEXT(0))

		writer.startSequence(Ber.APPLICATION(7))
		writer.startSequence(Ber.CONTEXT(0))
		writer.writeString(key, Ber.BERDataTypes.STRING)
		writer.endSequence()
		writer.startSequence(Ber.CONTEXT(1))
		writer.writeInt(value)
		writer.endSequence()
		writer.endSequence()

		writer.endSequence()
	}
	writer.endSequence()
}
