import * as Ber from '../../../Ber'
import { FunctionArgument, FunctionArgumentImpl } from '../../../model/FunctionArgument'
import { ParameterType } from '../../../model/Parameter'
import { FunctionArgumentBERID } from '../constants'
import { readParameterType } from './Parameter'
import {
	DecodeOptions,
	defaultDecode,
	DecodeResult,
	makeResult,
	unknownContext,
	check,
	appendErrors
} from './DecodeResult'

export { decodeFunctionArgument }

function decodeFunctionArgument(
	reader: Ber.Reader,
	options: DecodeOptions = defaultDecode
): DecodeResult<FunctionArgument> {
	const ber = reader.getSequence(FunctionArgumentBERID)
	let type: ParameterType | null = null
	let name: string | undefined = undefined
	const errors: Array<Error> = []
	while (ber.remain > 0) {
		const tag = ber.peek()
		if (tag === null) {
			unknownContext(errors, 'decode function argument', tag, options)
			continue
		}
		const seq = ber.getSequence(tag)
		switch (tag) {
			case Ber.CONTEXT(0):
				type = appendErrors(readParameterType(seq.readInt(), options), errors)
				break
			case Ber.CONTEXT(1):
				name = seq.readString(Ber.BERDataTypes.STRING)
				break
			default:
				unknownContext(errors, 'decode function context', tag, options)
				break
		}
	}
	type = check(type, 'decode function argument', 'type', ParameterType.Null, errors, options)
	return makeResult(new FunctionArgumentImpl(type, name), errors)
}
