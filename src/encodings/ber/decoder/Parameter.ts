import * as Ber from '../../../Ber/index.js'
import {
	fitsItsType,
	isValueOfType,
	Parameter,
	ParameterAccess,
	ParameterImpl,
	ParameterType,
} from '../../../model/Parameter.js'
import { StreamDescription } from '../../../model/StreamDescription.js'
import { EmberValue, isRelativeOID, MinMax, RelativeOID, StringIntegerCollection } from '../../../types/types.js'
import {
	appendErrors,
	check,
	DecodeOptions,
	DecodeResult,
	defaultDecode,
	makeResult,
	skipNext,
	unexpected,
	unknownContext,
} from './DecodeResult.js'
import { decodeStreamDescription } from './StreamDescription.js'
import { decodeStringIntegerCollection } from './StringIntegerCollection.js'

export { decodeParameter, readParameterType }

function decodeParameter(reader: Ber.Reader, options: DecodeOptions = defaultDecode): DecodeResult<Parameter> {
	reader.readSequence(Ber.BERDataTypes.SET)

	let identifier: string | undefined = undefined
	let description: string | undefined = undefined
	let value: EmberValue | undefined = undefined
	let valueType: ParameterType | undefined = undefined
	let minimum: number | null | undefined = undefined
	let maximum: number | null | undefined = undefined
	let access: ParameterAccess | undefined = undefined
	let format: string | undefined = undefined
	let enumeration: string | undefined = undefined
	let factor: number | undefined = undefined
	let isOnline: boolean | undefined = undefined
	let formula: string | undefined = undefined
	let step: number | undefined = undefined
	let defaultValue: EmberValue | undefined = undefined
	let defaultType: ParameterType | undefined = undefined
	let parameterType: ParameterType | undefined = undefined
	let streamIdentifier: number | undefined = undefined
	let enumMap: StringIntegerCollection | undefined = undefined
	let streamDescriptor: StreamDescription | undefined = undefined
	let schemaIdentifiers: string | undefined = undefined
	let templateReference: RelativeOID | undefined = undefined

	const errors: Array<Error> = []
	const endOffset = reader.offset + reader.length
	while (reader.offset < endOffset) {
		const tag = reader.readSequence()
		switch (tag) {
			case Ber.CONTEXT(0):
				identifier = reader.readString(Ber.BERDataTypes.STRING) ?? identifier
				break
			case Ber.CONTEXT(1):
				description = reader.readString(Ber.BERDataTypes.STRING) ?? description
				break
			case Ber.CONTEXT(2): {
				const decodedValue = reader.readValue()
				value = decodedValue.value
				valueType = decodedValue.type
				break
			}
			case Ber.CONTEXT(3):
				minimum = appendErrors(readMinMax(reader, 'minimum', options), errors)
				break
			case Ber.CONTEXT(4):
				maximum = appendErrors(readMinMax(reader, 'maximum', options), errors)
				break
			case Ber.CONTEXT(5):
				access = appendErrors(readParameterAccess(reader.readInt(), options), errors)
				break
			case Ber.CONTEXT(6):
				format = reader.readString(Ber.BERDataTypes.STRING) ?? format
				break
			case Ber.CONTEXT(7):
				enumeration = reader.readString(Ber.BERDataTypes.STRING) ?? enumeration
				break
			case Ber.CONTEXT(8):
				factor = reader.readInt() ?? factor
				break
			case Ber.CONTEXT(9):
				isOnline = reader.readBoolean() ?? isOnline
				break
			case Ber.CONTEXT(10):
				formula = reader.readString(Ber.BERDataTypes.STRING) ?? formula
				break
			case Ber.CONTEXT(11):
				step = reader.readInt() ?? step
				break
			case Ber.CONTEXT(12): {
				const decodedDefault = reader.readValue()
				defaultValue = decodedDefault.value
				defaultType = decodedDefault.type
				break
			}
			case Ber.CONTEXT(13):
				parameterType = appendErrors(readParameterType(reader.readInt(), options), errors)
				break
			case Ber.CONTEXT(14):
				streamIdentifier = reader.readInt() ?? streamIdentifier
				break
			case Ber.CONTEXT(15):
				enumMap = appendErrors(decodeStringIntegerCollection(reader, options), errors)
				break
			case Ber.CONTEXT(16):
				streamDescriptor = appendErrors(decodeStreamDescription(reader, options), errors)
				break
			case Ber.CONTEXT(17):
				schemaIdentifiers = reader.readString(Ber.BERDataTypes.STRING) ?? schemaIdentifiers
				break
			case Ber.CONTEXT(18):
				// A RELATIVE-OID. Earlier versions of this library wrote it as a UTF8String, which is still read, when
				// it holds a numeric path.
				if (reader.peek() === Ber.BERDataTypes.STRING) {
					const text = reader.readString(Ber.BERDataTypes.STRING)
					if (text !== null && isRelativeOID(text)) templateReference = text
					else errors.push(new Error(`decode parameter: template reference '${text}' is not a numeric path`))
				} else {
					templateReference = reader.readRelativeOID(Ber.BERDataTypes.RELATIVE_OID) ?? templateReference
				}
				break
			case 0:
				break // indefinite length
			default:
				unknownContext(errors, 'decode parameter', tag, options)
				skipNext(reader)
				break
		}
	}
	// As libember's effectiveType(). A null value (Glow 2.50) has no type of its own (libember's Value takes it as
	// ParameterType::None), so the type field decides; Null only when there is none.
	parameterType =
		parameterType === ParameterType.Trigger
			? ParameterType.Trigger
			: !!enumMap || !!enumeration
				? ParameterType.Enum
				: valueType && valueType !== ParameterType.Null
					? valueType
					: (parameterType ?? valueType)
	parameterType = check(parameterType, 'decode parameter', 'parameterType', ParameterType.Null, errors, options)

	// The value and default must be of the parameter type's form. The type is the value's own unless the parameter is a
	// trigger (any value), or an enum by its enumeration (its value an index); a default may be of any type. One that
	// doesn't fit is left out, with an error. (Both were kept as they came.)
	if (value !== undefined && !isValueOfType(parameterType, value)) {
		value = appendErrors(misfit(parameterType, 'value', valueType, options), errors)
	}
	if (defaultValue !== undefined && !isValueOfType(parameterType, defaultValue)) {
		defaultValue = appendErrors(misfit(parameterType, 'default', defaultType, options), errors)
	}

	const parameter = new ParameterImpl(
		parameterType,
		identifier,
		description,
		value,
		maximum,
		minimum,
		access,
		format,
		enumeration,
		factor,
		isOnline,
		formula,
		step,
		defaultValue,
		streamIdentifier,
		enumMap,
		streamDescriptor,
		schemaIdentifiers,
		templateReference
	)
	// The value and default fit the type, checked above: only a mistake in that check fails this
	if (!fitsItsType(parameter)) {
		throw new Error(`decode parameter: a value or default that doesn't fit the type ${parameterType} was kept`)
	}
	return makeResult(parameter, errors)
}

/**
 * A limit. The DTD's MinMax is an integer, a real or null; a limit of any other type (such as a string limit from a
 * provider that wrote it with the parameter's type) is left out, with an error. It was kept as it was, typed as a
 * number. (libember's MinMax reads any other type as the integer 0, which would make up a limit.)
 */
/** A value or default that doesn't fit the parameter's type: left out, with an error (or thrown) */
function misfit(
	parameterType: ParameterType,
	name: string,
	type: ParameterType | undefined,
	options: DecodeOptions
): DecodeResult<undefined> {
	return unexpected(
		[],
		'decode parameter',
		`a ${name} of the type ${type} doesn't fit a parameter of the type ${parameterType}; left out`,
		undefined,
		options
	)
}

function readMinMax(reader: Ber.Reader, name: string, options: DecodeOptions): DecodeResult<MinMax | undefined> {
	const { type, value } = reader.readValue()
	if (value === null || typeof value === 'number') return makeResult(value)
	return unexpected(
		[],
		'decode parameter',
		`${name} of the type ${type} is not an integer, real or null; left out`,
		undefined,
		options
	)
}

function readParameterAccess(value: number | null, options: DecodeOptions): DecodeResult<ParameterAccess> {
	switch (value) {
		case 0:
			return makeResult(ParameterAccess.None)
		case 1:
			return makeResult(ParameterAccess.Read)
		case 2:
			return makeResult(ParameterAccess.Write)
		case 3:
			return makeResult(ParameterAccess.ReadWrite)
		default:
			// A value the DTD doesn't define is read-only, as it is with libember: access() keeps the value, which
			// isWriteable() (true only for write and readWrite) takes as not writeable, and nothing hides it. It was
			// taken as readWrite. Read is also the DTD's default when the field is left out.
			return unexpected(
				[],
				'read parameter access',
				`unexpected parameter access '${value}'`,
				ParameterAccess.Read,
				options
			)
	}
}

function readParameterType(value: number | null, options: DecodeOptions): DecodeResult<ParameterType> {
	switch (value) {
		case 0:
			return makeResult(ParameterType.Null)
		case 1:
			return makeResult(ParameterType.Integer)
		case 2:
			return makeResult(ParameterType.Real)
		case 3:
			return makeResult(ParameterType.String)
		case 4:
			return makeResult(ParameterType.Boolean)
		case 5:
			return makeResult(ParameterType.Trigger)
		case 6:
			return makeResult(ParameterType.Enum)
		case 7:
			return makeResult(ParameterType.Octets)
		default:
			return unexpected(
				[],
				'read parameter type',
				`unexpected parameter type '${value}'`,
				ParameterType.Null,
				options
			)
	}
}
