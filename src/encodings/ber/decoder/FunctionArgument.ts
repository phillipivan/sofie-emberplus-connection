import * as Ber from '../../../Ber'
import { FunctionArgument, FunctionArgumentImpl } from '../../../model/FunctionArgument'
import { ParameterType } from '../../../model/Parameter'
import { FunctionArgumentBERID } from '../constants'
import { readParameterType } from './Parameter'

export { decodeFunctionArgument }

function decodeFunctionArgument(reader: Ber.Reader): FunctionArgument {
	const ber = reader.getSequence(FunctionArgumentBERID)
	let type: ParameterType | null = null
	let name: string | undefined = undefined
	while (ber.remain > 0) {
		const tag = ber.peek()
		if (tag === null) {
			throw new Error(``)
		}
		const seq = ber.getSequence(tag)
		switch (tag) {
			case Ber.CONTEXT(0):
				type = readParameterType(seq.readInt())
				break
			case Ber.CONTEXT(1):
				name = seq.readString(Ber.BERDataTypes.STRING)
				break
			default:
				throw new Error(``)
		}
	}
	if (type === null) {
		throw new Error(``)
	}
	return new FunctionArgumentImpl(type, name)
}
