import * as Ber from '../../../Ber'
import { Invocation, InvocationImpl } from '../../../model/Invocation'
import { EmberTypedValue } from '../../../types/types'
import { InvocationBERID } from '../constants'
import {
	DecodeOptions,
	defaultDecode,
	DecodeResult,
	unknownContext,
	makeResult
} from './DecodeResult'

export { decodeInvocation }

function decodeInvocation(
	reader: Ber.Reader,
	options: DecodeOptions = defaultDecode
): DecodeResult<Invocation> {
	const ber = reader.getSequence(InvocationBERID)
	let id: number | undefined = undefined
	const args: Array<EmberTypedValue> = []
	let argSeq: Ber.Reader
	const errors: Array<Error> = []
	while (ber.remain > 0) {
		const tag = ber.peek()
		if (tag === null) {
			unknownContext(errors, 'decode invocation', tag, options)
			continue
		}
		const seq = ber.getSequence(tag)
		switch (tag) {
			case Ber.CONTEXT(0):
				id = seq.readInt()
				break
			case Ber.CONTEXT(1):
				argSeq = seq.getSequence(Ber.BERDataTypes.SEQUENCE)
				while (argSeq.remain > 0) {
					const dataSeq = argSeq.getSequence(Ber.CONTEXT(0))
					// const dataTag = dataSeq.peek() // TODO I think readValue gets the tag
					args.push(dataSeq.readValue())
				}
				break
			default:
				unknownContext(errors, 'decode invocation', tag, options)
				break
		}
	}
	return makeResult(new InvocationImpl(id, args), errors)
}
