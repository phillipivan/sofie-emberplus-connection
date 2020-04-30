import * as Ber from '../../Ber'
import { Parameter, ParameterType, ParameterAccess } from '../../model/Parameter'
import { EmberValue } from '../../types/types'
import { encodeStringIntegerCollection } from './StringIntegerCollection'
import { encodeStreamDescription } from './StreamDescription'
import { elementTypeToInt } from './Matrix'

export function encodeParameter(parameter: Parameter, writer: Ber.Writer) {
	writer.startSequence(Ber.BERDataTypes.SET)

	const writeValue = (value: EmberValue) => {
		switch (parameter.parameterType) {
			case ParameterType.Real:
				writer.writeReal(value as number, Ber.BERDataTypes.REAL)
				break
			case ParameterType.Integer:
				writer.writeInt(value as number, Ber.BERDataTypes.INTEGER)
				break
			case ParameterType.Boolean:
				writer.writeBoolean(value as boolean, Ber.BERDataTypes.BOOLEAN)
				break
			case ParameterType.Octets:
				writer.writeBuffer(value as Buffer, Ber.BERDataTypes.OCTETSTRING)
				break
			default:
				writer.writeString(value as string, Ber.BERDataTypes.STRING)
		}
	}

	writer.writeIfDefined(parameter.identifier, writer.writeString, 0, Ber.BERDataTypes.STRING)
	writer.writeIfDefined(parameter.description, writer.writeString, 1, Ber.BERDataTypes.STRING)
	if (parameter.minimum) {
		writer.startSequence(Ber.CONTEXT(3))
		writeValue(parameter.minimum)
		writer.endSequence()
	}
	if (parameter.maximum) {
		writer.startSequence(Ber.CONTEXT(4))
		writeValue(parameter.maximum)
		writer.endSequence()
	}
	writer.writeIfDefined(
		parameter.access && parameterAccessToInt(parameter.access),
		writer.writeInt,
		5,
		Ber.BERDataTypes.INTEGER
	)
	writer.writeIfDefined(parameter.format, writer.writeString, 6, Ber.BERDataTypes.STRING)
	writer.writeIfDefined(parameter.enumeration, writer.writeString, 7, Ber.BERDataTypes.STRING)
	writer.writeIfDefined(parameter.factor, writer.writeInt, 8, Ber.BERDataTypes.INTEGER)
	writer.writeIfDefined(parameter.isOnline, writer.writeBoolean, 9, Ber.BERDataTypes.BOOLEAN)
	writer.writeIfDefined(parameter.formula, writer.writeString, 10, Ber.BERDataTypes.STRING)
	writer.writeIfDefined(parameter.step, writer.writeInt, 11, Ber.BERDataTypes.INTEGER)

	if (parameter.default) {
		writer.startSequence(Ber.CONTEXT(12))
		writeValue(parameter.default)
		writer.endSequence()
	}

	writer.writeIfDefined(
		elementTypeToInt(parameter.type),
		writer.writeInt,
		2,
		Ber.BERDataTypes.INTEGER
	)
	writer.writeIfDefined(parameter.streamIdentifier, writer.writeInt, 14, Ber.BERDataTypes.INTEGER)

	if (parameter.enumMap != null) {
		writer.startSequence(Ber.CONTEXT(15))
		encodeStringIntegerCollection(parameter.enumMap, writer)
		writer.endSequence()
	}

	if (parameter.streamDescriptor != null) {
		writer.startSequence(Ber.CONTEXT(16))
		encodeStreamDescription(parameter.streamDescriptor, writer)
		writer.endSequence()
	}

	writer.writeIfDefined(
		parameter.schemaIdentifiers,
		writer.writeString,
		17,
		Ber.BERDataTypes.STRING
	)

	writer.endSequence()
}

function parameterAccessToInt(parameter: ParameterAccess) {
	const paramToInt = {
		[ParameterAccess.None]: 0,
		[ParameterAccess.Read]: 0,
		[ParameterAccess.Write]: 0,
		[ParameterAccess.ReadWrite]: 0
	}

	return paramToInt[parameter]
}
