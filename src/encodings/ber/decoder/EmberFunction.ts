import * as Ber from '../../../Ber/index.js'
// import { EmberFunction, EmberFunctionImpl } from '../../../model/EmberFunction'
import { EmberFunction, EmberFunctionImpl } from '../../../model/EmberFunction.js'
import { decodeFunctionArgument } from './FunctionArgument.js'
import {
	DecodeOptions,
	defaultDecode,
	DecodeResult,
	unknownContext,
	makeResult,
	appendErrors,
	skipNext,
} from './DecodeResult.js'
import { FunctionArgument } from '../../../model/FunctionArgument.js'
import { RelativeOID } from '../../../types/types.js'

export { decodeFunctionContent }

function decodeFunctionContent(
	reader: Ber.Reader,
	options: DecodeOptions = defaultDecode
): DecodeResult<EmberFunction> {
	reader.readSequence(Ber.BERDataTypes.SET)
	let identifier: string | undefined = undefined
	let description: string | undefined = undefined
	let args: Array<FunctionArgument> | undefined = undefined
	let result: Array<FunctionArgument> | undefined = undefined
	let templateReference: RelativeOID | undefined = undefined
	let seqOffset: number
	let resOffset: number
	const errors: Array<Error> = []
	const endOffset = reader.offset + reader.length
	while (reader.offset < endOffset) {
		const tag = reader.readSequence()
		switch (tag) {
			case Ber.CONTEXT(0):
				identifier = reader.readString(Ber.BERDataTypes.STRING)
				break
			case Ber.CONTEXT(1):
				description = reader.readString(Ber.BERDataTypes.STRING)
				break
			case Ber.CONTEXT(2):
				args = []
				reader.readSequence(Ber.BERDataTypes.SEQUENCE)
				seqOffset = reader.offset + reader.length
				while (reader.offset < seqOffset) {
					const argTag = reader.readSequence()
					if (argTag === 0) continue // indefinite length
					if (argTag !== Ber.CONTEXT(0)) {
						unknownContext(errors, 'decode function content: arguments', argTag, options)
						skipNext(reader)
						continue
					}
					const argEl = appendErrors(decodeFunctionArgument(reader, options), errors)
					args.push(argEl)
				}
				break
			case Ber.CONTEXT(3):
				result = []
				reader.readSequence(Ber.BERDataTypes.SEQUENCE)
				resOffset = reader.offset + reader.length
				while (reader.offset < resOffset) {
					const resTag = reader.readSequence()
					if (resTag === 0) continue // indefinite length
					if (resTag !== Ber.CONTEXT(0)) {
						unknownContext(errors, 'decode function content: result', resTag, options)
						skipNext(reader)
						continue
					}
					const resEl = appendErrors(decodeFunctionArgument(reader, options), errors)
					result.push(resEl)
				}
				break
			case Ber.CONTEXT(4):
				templateReference = reader.readRelativeOID(Ber.BERDataTypes.RELATIVE_OID)
				break
			case 0:
				break // Idefinite length
			default:
				unknownContext(errors, 'decode function content', tag, options)
				skipNext(reader)
				break
		}
	}

	return makeResult(new EmberFunctionImpl(identifier, description, args, result, templateReference), errors)
}
