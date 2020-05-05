import * as Ber from '../../Ber'
import { StringIntegerCollection } from '../../types/types'

const StringIntegerCollectionBERID = 8
const StringIntegerPairBERID = 7

export function decodeStringIntegerCollection(reader: Ber.Reader): StringIntegerCollection {
	const seq = reader.getSequence(StringIntegerCollectionBERID)
	const collection: StringIntegerCollection = new Map<string, number>()
	while (seq.remain > 0) {
		const tag = seq.peek()
		if (tag !== Ber.CONTEXT(0)) {
			throw new Error(``)
		}
		const data = seq.getSequence(Ber.CONTEXT(0))
		const pair = decodeStringIntegerPair(data)
		collection.set(pair.key, pair.value)
	}
	return collection
}

function decodeStringIntegerPair(reader: Ber.Reader): { key: string, value: number } {
	let key: string | null = null
	let value: number | null = null
	const seq = reader.getSequence(StringIntegerPairBERID)
	while (seq.remain > 0) {
		const tag = seq.peek()
		const dataSeq = seq.getSequence(tag!)
		switch (tag) {
			case Ber.CONTEXT(0):
				key = dataSeq.readString(Ber.BERDataTypes.STRING)
				break
			case Ber.CONTEXT(1):
				value = dataSeq.readInt()
				break
			default:
				throw new Error(``)
		}
	}
	if ((key === null) || (value === null)) {
		throw new Error(``)
	}
	return { key, value }
}
