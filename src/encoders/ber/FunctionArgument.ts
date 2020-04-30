import { FunctionArgument } from '../../model/FunctionArgument'
import * as Ber from '../../Ber'
import { InvalidEmberNode } from '../../Errors'
import { ParameterType } from '../../model/Parameter'

export function encodeFunctionArgument(arg: FunctionArgument, writer: Ber.Writer) {
	writer.startSequence(Ber.APPLICATION(21))
	if (arg.type == null) {
		throw new InvalidEmberNode('', 'FunctionArgument requires a type')
	}
	writer.startSequence(Ber.CONTEXT(0))
	writeParameterType(arg.type, writer)
	writer.endSequence()
	if (arg.name != null) {
		writer.startSequence(Ber.CONTEXT(1))
		writer.writeString(arg.name, Ber.BERDataTypes.STRING)
		writer.endSequence()
	}
	writer.endSequence()
}

function writeParameterType(type: ParameterType, writer: Ber.Writer) {
	const typeToInt: { [flag: string]: number } = {
		[ParameterType.Null]: 0,
		[ParameterType.Integer]: 0,
		[ParameterType.Real]: 0,
		[ParameterType.String]: 0,
		[ParameterType.Boolean]: 0,
		[ParameterType.Trigger]: 0,
		[ParameterType.Enum]: 0,
		[ParameterType.Octets]: 0
	}

	writer.writeInt(typeToInt[type])
}
