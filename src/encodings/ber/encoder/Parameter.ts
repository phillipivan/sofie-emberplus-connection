/* eslint-disable @typescript-eslint/unbound-method */
import * as Ber from '../../../Ber/index.js'
import { InvalidEmberNode } from '../../../Errors.js'
import { isValueOfType, Parameter, ParameterAccess, ParameterType } from '../../../model/Parameter.js'
import { EmberTypedValue, MinMax } from '../../../types/types.js'
import { encodeStreamDescription } from './StreamDescription.js'
import { encodeStringIntegerCollection } from './StringIntegerCollection.js'

export const encodeParameter = (parameter: Parameter, writer: Ber.Writer): void => {
	writer.startSequence(Ber.BERDataTypes.SET)

	// The value or default, written as the parameter's type says (Writer.writeValue with a typed value)
	const writeValue = (key: 'value' | 'defaultValue'): void => writer.writeValue(typedValue(parameter, key))

	const writeMinMax = (value: MinMax | undefined, tag: number): void => {
		// MinMax is a CHOICE of integer, real or null whatever the parameter type. Anything else, such as a
		// string limit decoded from a provider that encoded it with the parameter's type, is left out.
		if (value !== null && typeof value !== 'number') return
		writer.startSequence(tag)
		if (value === null) {
			writer.writeNull()
		} else if (parameter.parameterType === ParameterType.Real || !Number.isInteger(value)) {
			writer.writeReal(value, Ber.BERDataTypes.REAL)
		} else {
			writer.writeInt(value, Ber.BERDataTypes.INTEGER)
		}
		writer.endSequence()
	}

	writer.writeIfDefined(parameter.identifier, writer.writeString, 0, Ber.BERDataTypes.STRING)
	writer.writeIfDefined(parameter.description, writer.writeString, 1, Ber.BERDataTypes.STRING)
	if (parameter.value !== undefined) {
		writer.startSequence(Ber.CONTEXT(2))
		writeValue('value')
		writer.endSequence()
	}
	writeMinMax(parameter.minimum, Ber.CONTEXT(3))
	writeMinMax(parameter.maximum, Ber.CONTEXT(4))
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

	if (parameter.defaultValue !== undefined) {
		writer.startSequence(Ber.CONTEXT(12))
		writeValue('defaultValue')
		writer.endSequence()
	}

	// A parameter that carries only a value is a value change, such as a consumer's set request. The value's own BER
	// type gives its type, so the type field is left out, as Lawo's libember does.
	const valueOnly =
		parameter.value !== undefined &&
		Object.entries<unknown>({ ...parameter }).every(
			([key, v]) => v === undefined || ['type', 'parameterType', 'value'].includes(key)
		)
	if (parameter.parameterType && !valueOnly) {
		writer.startSequence(Ber.CONTEXT(13))
		writer.writeInt(parameterTypeToInt(parameter.parameterType))
		writer.endSequence()
	}

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

	writer.writeIfDefined(parameter.schemaIdentifiers, writer.writeString, 17, Ber.BERDataTypes.STRING)

	// A RELATIVE-OID, as the DTD has it and libember writes it (and as the other elements' template references are)
	if (parameter.templateReference != null) {
		writer.startSequence(Ber.CONTEXT(18))
		writer.writeRelativeOID(parameter.templateReference, Ber.BERDataTypes.RELATIVE_OID)
		writer.endSequence()
	}

	writer.endSequence()
}

const parameterAccessToInt = (parameter: ParameterAccess): number => {
	const paramToInt: Record<ParameterAccess, number> = {
		[ParameterAccess.None]: 0,
		[ParameterAccess.Read]: 1,
		[ParameterAccess.Write]: 2,
		[ParameterAccess.ReadWrite]: 3,
	}

	return paramToInt[parameter]
}

const parameterTypeToInt = (pt: ParameterType): number => {
	const paramTypeToInt: Record<ParameterType, number> = {
		[ParameterType.Null]: 0,
		[ParameterType.Integer]: 1,
		[ParameterType.Real]: 2,
		[ParameterType.String]: 3,
		[ParameterType.Boolean]: 4,
		[ParameterType.Trigger]: 5,
		[ParameterType.Enum]: 6,
		[ParameterType.Octets]: 7,
	}

	return paramTypeToInt[pt]
}

/**
 * A parameter's value or default with its type, for the writer to write as that type says. A value that doesn't fit
 * the type, from a caller that doesn't check types, is refused: it was coerced (Number(), + ''), written as NaN for a
 * real, thrown on by the writer, or, for a Null parameter, written as a NULL whatever it was.
 */
function typedValue(parameter: Parameter, key: 'value' | 'defaultValue'): EmberTypedValue {
	const value = parameter[key] ?? null
	if (!isValueOfType(parameter.parameterType, value)) {
		throw new InvalidEmberNode(
			parameter.identifier,
			`a ${key} ${String(value)} doesn't fit a parameter of the type ${parameter.parameterType}`
		)
	}
	switch (parameter.parameterType) {
		case ParameterType.Integer:
			return { type: ParameterType.Integer, value: parameter[key] ?? null }
		case ParameterType.Real:
			return { type: ParameterType.Real, value: parameter[key] ?? null }
		case ParameterType.Enum:
			// an enum's value is the index of its entry, written as an integer
			return { type: ParameterType.Enum, value: parameter[key] ?? null }
		case ParameterType.String:
			return { type: ParameterType.String, value: parameter[key] ?? null }
		case ParameterType.Boolean:
			return { type: ParameterType.Boolean, value: parameter[key] ?? null }
		case ParameterType.Octets:
			return { type: ParameterType.Octets, value: parameter[key] ?? null }
		case ParameterType.Null:
			return { type: ParameterType.Null, value: null }
		case ParameterType.Trigger:
			return { type: ParameterType.Trigger, value: parameter[key] ?? null }
	}
}
