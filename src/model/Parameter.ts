import { EmberElement, ElementType, isEmberElement } from './EmberElement'
import { RelativeOID } from './RelativeOID'
import { Template } from './Template'
import { EmberValue, MinMax, StringIntegerCollection } from '../types/types'
import { StreamDescription } from './StreamDescription'

export { Parameter, ParameterType, isParameter }

enum ParameterType {
	Null = 'NULL',
	Integer = 'INTEGER',
	Real = 'REAL',
	String = 'STRING',
	Boolean = 'BOOLEAN',
	Trigger = 'TRIGGER',
	Enum = 'ENUM',
	Octets = 'OCTETS'
}

enum ParameterAccess {
	None = 'NONE',
	Read = 'READ',
	Write = 'WRITE',
	ReadWrite = 'READ_WRITE'
}

// TODO break down further by ParamterType?
interface Parameter extends EmberElement {
	type: ElementType.Parameter
	parameterType: ParameterType
	identifier?: string
	description?: string
	value?: EmberValue
	maximum?: MinMax
	minimum?: MinMax
	access?: ParameterAccess
	format?: string
	enumeration?: string
	factor?: number // Integer32
	isOnline?: boolean
	formula?: string
	step?: number // Integer32
	default?: EmberValue
	streamIdentifier?: number // BER readInt
	enumMap?: StringIntegerCollection
	streamDescriptor?: StreamDescription
	schemaIdentifiers?: string
	templateReference: RelativeOID<Template>
}

/**
 * Type predicate for Parameter interface.
 * TODO: write tests for actual values and optional properties
 *
 * @param obj - object to check
 * @returns true if object is a valid Parameter, false if not
 */
function isParameter(obj: any): obj is Parameter {
	if (!isEmberElement(obj)) {
		return false
	}

	const { type, parameterType, templateReference } = obj as any
	if (type !== ElementType.Parameter) {
		return false
	}

	if (!parameterType || !templateReference) {
		return false
	}

	return true
}

export class ParamterImpl implements Parameter {
	type: ElementType.Parameter
	parameterType: ParameterType
	identifier?: string
	description?: string
	value?: EmberValue
	maximum?: MinMax
	minimum?: MinMax
	access?: ParameterAccess
	format?: string
	enumeration?: string
	factor?: number // Integer32
	isOnline?: boolean
	formula?: string
	step?: number // Integer32
	default?: EmberValue
	streamIdentifier?: number // BER readInt
	enumMap?: StringIntegerCollection
	streamDescriptor?: StreamDescription
	schemaIdentifiers?: string
	templateReference: RelativeOID<Template>
	constructor() { }
}
