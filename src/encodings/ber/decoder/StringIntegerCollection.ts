import * as Ber from '../../../Ber'
import { StringIntegerCollection } from '../../../types/types'
import { StringIntegerCollectionBERID, StringIntegerPairBERID } from '../constants'
import {
	DecodeOptions,
	defaultDecode,
	DecodeResult,
	makeResult,
	unknownContext,
	appendErrors,
	check
} from './DecodeResult'

export { decodeStringIntegerCollection }

function decodeStringIntegerCollection(
	reader: Ber.Reader,
	options: DecodeOptions = defaultDecode
): DecodeResult<StringIntegerCollection> {
	const seq = reader.getSequence(StringIntegerCollectionBERID)
	const collection: StringIntegerCollection = new Map<string, number>()
	const errors: Array<Error> = []
	while (seq.remain > 0) {
		const tag = seq.peek()
		if (tag !== Ber.CONTEXT(0)) {
			unknownContext(errors, 'decode string integer collection', tag, options)
			continue
		}
		const data = seq.getSequence(Ber.CONTEXT(0))
		const pair = appendErrors(decodeStringIntegerPair(data, options), errors)
		collection.set(pair.key, pair.value)
	}
	return makeResult(collection, errors)
}

function decodeStringIntegerPair(
	reader: Ber.Reader,
	options: DecodeOptions = defaultDecode
): DecodeResult<{ key: string; value: number }> {
	let key: string | null = null
	let value: number | null = null
	const errors: Array<Error> = []
	const seq = reader.getSequence(StringIntegerPairBERID)
	while (seq.remain > 0) {
		const tag = seq.peek()
		if (tag === null) {
			unknownContext(errors, 'decode string integer pair', tag, options)
			continue
		}
		const dataSeq = seq.getSequence(tag)
		switch (tag) {
			case Ber.CONTEXT(0):
				key = dataSeq.readString(Ber.BERDataTypes.STRING)
				break
			case Ber.CONTEXT(1):
				value = dataSeq.readInt()
				break
			default:
				unknownContext(errors, 'deocde string integer pair', tag, options)
				break
		}
	}
	key = check(
		key,
		'decode string integer pair',
		'key',
		`key${(Math.random() * 1000000) | 0}`,
		errors,
		options
	)
	value = check(value, 'decode string integer pair', 'value', -1, errors, options)
	return makeResult({ key, value }, errors)
}
