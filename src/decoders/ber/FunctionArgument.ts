import * as Ber from '../../Ber'
import { FunctionArgument, FunctionArgumentImpl } from '../../model/FunctionArgument'
import { ParameterType } from '../../model/Parameter'

const FunctionArgumentBERID = 21

export function decodeFunctionArgument(reader: Ber.Reader): FunctionArgument {
	const ber = reader.getSequence(FunctionArgumentBERID)
	let type: ParameterType | null = null
	let name: string | undefined = undefined
	while (ber.remain > 0) {
		const tag = ber.peek()
		const seq = ber.getSequence(tag!)
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

function readParameterType(value: number): ParameterType {
	switch (value) {
		case 0: return ParameterType.Null
		case 1: return ParameterType.Integer
		case 2: return ParameterType.Real
		case 3: return ParameterType.String
		case 4: return ParameterType.Boolean
		case 5: return ParameterType.Trigger
		case 6: return ParameterType.Enum
		case 7: return ParameterType.Octets
		default:
			throw new Error(``)
	}
}
