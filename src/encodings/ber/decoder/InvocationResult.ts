import * as Ber from '../../../Ber'
import { InvocationResult, InvocationResultImpl } from '../../../model/InvocationResult'
import { EmberTypedValue } from '../../../types/types'
import { InvocationResultBERID } from '../constants'
import {
	DecodeOptions,
	defaultDecode,
	DecodeResult,
	makeResult,
	unknownContext,
	check
} from './DecodeResult'

export function decodeInvocationResult(
	reader: Ber.Reader,
	options: DecodeOptions = defaultDecode
): DecodeResult<InvocationResult> {
	const ber = reader.getSequence(InvocationResultBERID)
	let id: number | null = null
	let success: boolean | undefined = undefined
	let result: Array<EmberTypedValue> | undefined = undefined
	let resSeq: Ber.Reader
	const errors: Array<Error> = []
	while (ber.remain > 0) {
		const tag = ber.peek()
		if (tag === null) {
			unknownContext(errors, 'decode invocation result', tag, options)
			continue
		}
		const seq = ber.getSequence(tag)
		switch (tag) {
			case Ber.CONTEXT(0):
				id = seq.readInt()
				break
			case Ber.CONTEXT(1):
				success = seq.readBoolean()
				break
			case Ber.CONTEXT(2):
				result = []
				resSeq = seq.getSequence(Ber.BERDataTypes.SEQUENCE)
				while (resSeq.remain > 0) {
					const resTag = resSeq.peek()
					if (resTag === null) {
						unknownContext(errors, 'decode invocation result: result', resTag, options)
						continue
					}
					const faSeq = resSeq.getSequence(resTag)
					if (resTag !== Ber.CONTEXT(0)) {
						unknownContext(errors, 'decode invoation result: result', resTag, options)
						continue
					}
					result.push(faSeq.readValue())
				}
				break
			default:
				unknownContext(errors, 'decode invocation result', tag, options)
				break
		}
	}
	id = check(id, 'decode invocation result', 'id', -1, errors, options)
	return makeResult(new InvocationResultImpl(id, success, result), errors)
}
