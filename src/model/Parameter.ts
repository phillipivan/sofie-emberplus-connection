import { EmberElement, ElementType } from './EmberElement'
import { RelativeOID } from './RelativeOID'
import { Template } from './Template'
import { EmberValue, MinMax, StringIntegerCollection } from '../types/types'
import { StreamDescription } from './StreamDescription'

export { Parameter, ParameterType }

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
	paramterType: ParameterType
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
	default?: any
	streamIdentifier?: number // BER readInt
	enumMap?: StringIntegerCollection
	streamDescriptor?: StreamDescription
	schemaIdentifiers?: string
	templateReference: RelativeOID<Template>
}
