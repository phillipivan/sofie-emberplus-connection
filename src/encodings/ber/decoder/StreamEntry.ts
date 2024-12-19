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
	check,
	skipNext,
} from './DecodeResult'
import { ParameterType } from '../../../model/Parameter'

export { decodeStreamEntry, decodeStreamEntries }

function decodeStreamEntries(
	reader: Ber.Reader,
	options: DecodeOptions = defaultDecode
): DecodeResult<Array<StreamEntry>> {
	reader.readSequence(StreamEntriesBERID)
	const streamEntries = makeResult<Array<StreamEntry>>([])
	const endOffset = reader.offset + reader.length
	while (reader.offset < endOffset) {
		const tag = reader.readSequence()
		if (tag === 0) continue
		if (tag !== Ber.CONTEXT(0)) {
			unknownContext(streamEntries, 'decode stream entries', tag, options)
			skipNext(reader)
			continue
		}
		const rootEl = decodeStreamEntry(reader)
		safeSet(rootEl, streamEntries, (x, y) => {
			y.push(x)
			return y
		})
	}
	return streamEntries
}

function decodeStreamEntry(reader: Ber.Reader, options: DecodeOptions = defaultDecode): DecodeResult<StreamEntry> {
	reader.readSequence(StreamEntryBERID)
	let identifier: number | null = null
	let value: EmberTypedValue | null = null
	const errors: Array<Error> = []
	const endOffset = reader.offset + reader.length
	while (reader.offset < endOffset) {
		const tag = reader.readSequence()
		switch (tag) {
			case Ber.CONTEXT(0):
				identifier = reader.readInt()
				break
			case Ber.CONTEXT(1):
				value = reader.readValue()

				// Special handling for audio level data
				if (value.type === ParameterType.Octets && Buffer.isBuffer(value.value)) {
					const buffer = value.value

					// THIS IS CURRENTLY A HACK
					// HARDOCED TO 64 AND 68
					// BUT SHOULD FOLLOW THE NODE's offSet value
					// Debug logging
					console.log('Audio buffer analysis:')
					console.log('Buffer length:', buffer.length)
					console.log(
						'Buffer Bytes:',
						Array.from(buffer)
							.map((b) => '0x' + b.toString(16).padStart(2, '0'))
							.join(' ')
					)

					if (buffer.length >= 4) {
						// The buffer appears to contain pairs of float32 values
						// First value is the current level, second is the peak
						const currentLevel = buffer.readFloatLE(64)
						const peakLevel = buffer.length >= 8 ? buffer.readFloatLE(68) : currentLevel
						console.log('Decoded current level:', currentLevel)
						console.log('Decoded peak level:', peakLevel)

						// Convert to Real type
						value = {
							type: ParameterType.Real,
							value: currentLevel,
						}
					} else {
						console.warn('Audio buffer too short:', buffer.length)
					}
				}
				break
			case 0:
				break // indefinite length
			default:
				unknownContext(errors, 'decode stream entry', tag, options)
				skipNext(reader)
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
