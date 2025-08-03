import * as Ber from '../../../Ber/index.js'
import { Invocation, InvocationImpl } from '../../../model/Invocation.js'
import { EmberTypedValue } from '../../../types/types.js'
import { InvocationBERID } from '../constants.js'
import { DecodeOptions, defaultDecode, DecodeResult, unknownContext, makeResult, skipNext } from './DecodeResult.js'

export { decodeInvocation }

function decodeInvocation(reader: Ber.Reader, options: DecodeOptions = defaultDecode): DecodeResult<Invocation> {
	reader.readSequence(InvocationBERID)
	let id: number | undefined = undefined
	const args: Array<EmberTypedValue> = []
	let seqOffset: number
	const errors: Array<Error> = []
	const endOffset = reader.offset + reader.length
	while (reader.offset < endOffset) {
		const tag = reader.readSequence()
		switch (tag) {
			case Ber.CONTEXT(0):
				id = reader.readInt()
				break
			case Ber.CONTEXT(1):
				reader.readSequence(Ber.BERDataTypes.SEQUENCE)
				seqOffset = reader.offset + reader.length
				while (reader.offset < seqOffset) {
					const tag = reader.readSequence()
					if (tag === Ber.CONTEXT(0)) {
						args.push(reader.readValue())
					} else {
						unknownContext(errors, 'decode invocation arguments', tag, options)
						skipNext(reader)
					}
				}
				break
			case 0:
				break // indefinite length
			default:
				unknownContext(errors, 'decode invocation', tag, options)
				skipNext(reader)
				break
		}
	}
	return makeResult(new InvocationImpl(id, args), errors)
}
