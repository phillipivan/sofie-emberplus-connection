import * as Ber from '../../../Ber'
import { Parameter, ParameterType, ParameterImpl, ParameterAccess } from '../../../model/Parameter'
import { decodeStreamDescription } from './StreamDescription'
import { decodeStringIntegerCollection } from './StringIntegerCollection'
import {
	DecodeOptions,
	defaultDecode,
	DecodeResult,
	check,
	makeResult,
	unexpected,
	appendErrors
} from './DecodeResult'
import { EmberValue, StringIntegerCollection, RelativeOID } from '../../../types/types'
import { StreamDescription } from '../../../model/StreamDescription'

export { decodeParameter, readParameterType }

function decodeParameter(
	reader: Ber.Reader,
	options: DecodeOptions = defaultDecode
): DecodeResult<Parameter> {
	const ber = reader.getSequence(Ber.BERDataTypes.SET)

	let identifier: string | undefined = undefined
	let description: string | undefined = undefined
	let value: EmberValue | undefined = undefined
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
	let parameterType: ParameterType | undefined = undefined
	let streamIdentifier: number | undefined = undefined
	let enumMap: StringIntegerCollection | undefined = undefined
	let streamDescriptor: StreamDescription | undefined = undefined
	let schemaIdentifiers: string | undefined = undefined
	let templateReference: RelativeOID | undefined = undefined

	const errors: Array<Error> = []

	while (ber.remain > 0) {
		const tag = ber.peek()
		if (tag === null) {
			throw new Error(``)
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
				value = seq.readValue().value
				break
			case Ber.CONTEXT(3):
				minimum = seq.readValue().value as number | null
				break
			case Ber.CONTEXT(4):
				maximum = seq.readValue().value as number | null
				break
			case Ber.CONTEXT(5):
				access = appendErrors(readParameterAccess(seq.readInt(), options), errors)
				break
			case Ber.CONTEXT(6):
				format = seq.readString(Ber.BERDataTypes.STRING)
				break
			case Ber.CONTEXT(7):
				enumeration = seq.readString(Ber.BERDataTypes.STRING)
				break
			case Ber.CONTEXT(8):
				factor = seq.readInt()
				break
			case Ber.CONTEXT(9):
				isOnline = seq.readBoolean()
				break
			case Ber.CONTEXT(10):
				formula = seq.readString(Ber.BERDataTypes.STRING)
				break
			case Ber.CONTEXT(11):
				step = seq.readInt()
				break
			case Ber.CONTEXT(12):
				defaultValue = seq.readValue().value // Write value uses type
				break
			case Ber.CONTEXT(13):
				parameterType = appendErrors(readParameterType(seq.readInt(), options), errors)
				break
			case Ber.CONTEXT(14):
				streamIdentifier = seq.readInt()
				break
			case Ber.CONTEXT(15):
				enumMap = appendErrors(decodeStringIntegerCollection(seq, options), errors)
				break
			case Ber.CONTEXT(16):
				streamDescriptor = appendErrors(decodeStreamDescription(seq, options), errors)
				break
			case Ber.CONTEXT(17):
				schemaIdentifiers = seq.readString(Ber.BERDataTypes.STRING)
				break
			case Ber.CONTEXT(18):
				templateReference = seq.readString(Ber.BERDataTypes.STRING)
				break
			default:
				throw new Error(``)
		}
	}
	parameterType = check(
		parameterType,
		'decode parameter',
		'parameterType',
		ParameterType.Null,
		errors,
		options
	)

	return makeResult(
		new ParameterImpl(
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
		),
		errors
	)
}

function readParameterAccess(value: number, options: DecodeOptions): DecodeResult<ParameterAccess> {
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
			return unexpected(
				[],
				'read parameter access',
				`unexpected parameter access '${value}'`,
				ParameterAccess.ReadWrite,
				options
			)
	}
}

function readParameterType(value: number, options: DecodeOptions): DecodeResult<ParameterType> {
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
