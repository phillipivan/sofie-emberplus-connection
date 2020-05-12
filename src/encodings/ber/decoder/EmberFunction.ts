import * as Ber from '../../../Ber'
// import { EmberFunction, EmberFunctionImpl } from '../../../model/EmberFunction'
import { EmberFunction, EmberFunctionImpl } from '../../../model/EmberFunction'
import { decodeFunctionArgument } from './FunctionArgument'
import {
	DecodeOptions,
	defaultDecode,
	DecodeResult,
	unknownContext,
	makeResult,
	appendErrors
} from './DecodeResult'
import { FunctionArgument } from '../../../model/FunctionArgument'
import { RelativeOID } from '../../../types/types'

export { decodeFunctionContent }

function decodeFunctionContent(
	reader: Ber.Reader,
	options: DecodeOptions = defaultDecode
): DecodeResult<EmberFunction> {
	const ber = reader.getSequence(Ber.BERDataTypes.SET)
	let readArgSeq: Ber.Reader
	let readResSeq: Ber.Reader
	let identifier: string | undefined = undefined
	let description: string | undefined = undefined
	let args: Array<FunctionArgument> | undefined = undefined
	let result: Array<FunctionArgument> | undefined = undefined
	let templateReference: RelativeOID | undefined = undefined
	const errors: Array<Error> = []
	while (ber.remain > 0) {
		const tag = ber.peek()
		if (tag === null) {
			unknownContext(errors, 'decode function content', tag, options)
			continue
		}
		const seq = ber.getSequence(tag)
		switch (tag) {
			case Ber.CONTEXT(0):
				identifier = seq.readString(Ber.BERDataTypes.STRING)
				break
			case Ber.CONTEXT(1):
				description = seq.readString(Ber.BERDataTypes.STRING)
				break
			case Ber.CONTEXT(2):
				args = []
				readArgSeq = seq.getSequence(Ber.BERDataTypes.SEQUENCE)
				while (readArgSeq.remain > 0) {
					const argTag = readArgSeq.peek() // TODO check this
					if (argTag !== Ber.CONTEXT(0)) {
						unknownContext(errors, 'decode function content: arguments', argTag, options)
						continue
					}
					const argSeq = readArgSeq.getSequence(Ber.CONTEXT(0))
					const argEl = appendErrors(decodeFunctionArgument(argSeq, options), errors)
					args.push(argEl)
				}
				break
			case Ber.CONTEXT(3):
				result = []
				readResSeq = seq.getSequence(Ber.BERDataTypes.SEQUENCE)
				while (readResSeq.remain > 0) {
					const resTag = readResSeq.peek()
					if (resTag !== Ber.CONTEXT(0)) {
						unknownContext(errors, 'decode function content: result', resTag, options)
						continue
					}
					const resSeq = readResSeq.getSequence(Ber.CONTEXT(0))
					const resEl = appendErrors(decodeFunctionArgument(resSeq, options), errors)
					result.push(resEl)
				}
				break
			case Ber.CONTEXT(4):
				templateReference = seq.readRelativeOID(Ber.BERDataTypes.RELATIVE_OID)
				break
			default:
				unknownContext(errors, 'decode function content', tag, options)
				break
		}
	}

	return makeResult(
		new EmberFunctionImpl(identifier, description, args, result, templateReference),
		errors
	)
}
