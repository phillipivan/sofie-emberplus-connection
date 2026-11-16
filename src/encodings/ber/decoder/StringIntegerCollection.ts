import * as Ber from '../../../Ber/index.js'
import { StringIntegerCollection } from '../../../types/types.js'
import { StringIntegerCollectionBERID, StringIntegerPairBERID } from '../constants.js'
import {
	appendErrors,
	check,
	DecodeOptions,
	DecodeResult,
	defaultDecode,
	makeResult,
	skipNext,
	unknownContext,
} from './DecodeResult.js'

export { decodeStringIntegerCollection }

function decodeStringIntegerCollection(
	reader: Ber.Reader,
	options: DecodeOptions = defaultDecode
): DecodeResult<StringIntegerCollection> {
	reader.readSequence(StringIntegerCollectionBERID)
	const collection: StringIntegerCollection = new Map<string, number>()
	const errors: Array<Error> = []
	const endOffset = reader.offset + reader.length
	while (reader.offset < endOffset) {
		const tag = reader.readSequence()
		if (tag === 0) continue
		if (tag !== Ber.CONTEXT(0)) {
			unknownContext(errors, 'decode string integer collection', tag, options)
			skipNext(reader)
			continue
		}
		const pair = appendErrors(decodeStringIntegerPair(reader, options), errors)
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
	reader.readSequence(StringIntegerPairBERID)
	const endOffset = reader.offset + reader.length
	while (reader.offset < endOffset) {
		const tag = reader.readSequence()
		switch (tag) {
			case Ber.CONTEXT(0):
				key = reader.readString(Ber.BERDataTypes.STRING)
				break
			case Ber.CONTEXT(1):
				value = reader.readInt()
				break
			case 0:
				break // indefinite length
			default:
				unknownContext(errors, 'deocde string integer pair', tag, options)
				skipNext(reader)
				break
		}
	}
	// An entry without a name is named '', as libember names it (GlowStringIntegerPair::name()); it was given a made-up
	// `key<random number>`. The error is kept.
	key = check(key, 'decode string integer pair', 'key', '', errors, options)
	value = check(value, 'decode string integer pair', 'value', -1, errors, options)
	return makeResult({ key, value }, errors)
}
