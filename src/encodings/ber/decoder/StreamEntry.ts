import * as Ber from '../../../Ber'
import { StreamEntry, StreamEntryImpl } from '../../../model/StreamEntry'
import { EmberTypedValue, literal } from '../../../types/types'
import { StreamEntryBERID, StreamEntriesBERID } from '../constants'
import {
	DecodeResult,
	makeResult,
	unknownContext,
	DecodeOptions,
	defaultDecode,
	safeSet,
	check
} from './DecodeResult'
import { ParameterType } from '../../../model/Parameter'

export { decodeStreamEntry, decodeStreamEntries }

function decodeStreamEntries(
	reader: Ber.Reader,
	options: DecodeOptions = defaultDecode
): DecodeResult<Array<StreamEntry>> {
	const seq = reader.getSequence(StreamEntriesBERID)
	const streamEntries = makeResult<Array<StreamEntry>>([])
	while (seq.remain > 0) {
		const tag = seq.peek()
		if (tag !== Ber.CONTEXT(0)) {
			unknownContext(streamEntries, 'decode stream entries', tag, options)
		}
		const data = seq.getSequence(Ber.CONTEXT(0))
		const rootEl = decodeStreamEntry(data)
		safeSet(rootEl, streamEntries, (x, y) => {
			y.push(x)
			return y
		})
	}
	return streamEntries
}

function decodeStreamEntry(
	reader: Ber.Reader,
	options: DecodeOptions = defaultDecode
): DecodeResult<StreamEntry> {
	const ber = reader.getSequence(StreamEntryBERID)
	let identifier: number | null = null
	let value: EmberTypedValue | null = null
	const errors: Array<Error> = []
	while (ber.remain > 0) {
		const tag = ber.peek()
		if (tag === null) {
			unknownContext(errors, 'decode stream entry', tag, options)
			continue
		}
		const seq = ber.getSequence(tag)
		switch (tag) {
			case Ber.CONTEXT(0):
				identifier = seq.readInt()
				break
			case Ber.CONTEXT(1):
				value = seq.readValue()
				break
			default:
				unknownContext(errors, 'decode stream entry', tag, options)
				break
		}
	}
	identifier = check(identifier, 'decode stream entry', 'identifier', 0, errors, options)
	value = check(
		value,
		'decode stream entry',
		'value',
		literal<EmberTypedValue>({ value: null, type: ParameterType.Null }),
		errors,
		options
	)
	return makeResult(new StreamEntryImpl(identifier, value), errors)
}
