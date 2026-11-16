import { EmberValue, MinMax, RelativeOID, StringIntegerCollection } from '../types/types.js'
import { ElementType, EmberBaseElement } from './EmberElement.js'
import { StreamDescription } from './StreamDescription.js'

export { Parameter, ParameterType, ParameterAccess, ParameterImpl, ParameterValue, TypedParameter, isValueOfType }

enum ParameterType {
	Null = 'NULL',
	Integer = 'INTEGER',
	Real = 'REAL',
	String = 'STRING',
	Boolean = 'BOOLEAN',
	Trigger = 'TRIGGER',
	Enum = 'ENUM',
	Octets = 'OCTETS',
}

enum ParameterAccess {
	None = 'NONE',
	Read = 'READ',
	Write = 'WRITE',
	ReadWrite = 'READ_WRITE',
}

/**
 * The JavaScript form of the value of a parameter of a type: a number for an integer, real or enum (an enumeration's
 * 0-based index), a string, a boolean or a Buffer, or null for any of them (a null value, Glow 2.50). A trigger's value
 * is written by its own JavaScript type, so it may be any of them.
 */
type ParameterValue<T extends ParameterType> = T extends ParameterType.Integer | ParameterType.Real | ParameterType.Enum
	? number | null
	: T extends ParameterType.String
		? string | null
		: T extends ParameterType.Boolean
			? boolean | null
			: T extends ParameterType.Octets
				? Buffer | null
				: T extends ParameterType.Null
					? null
					: EmberValue

/** The fields a parameter has whatever its type (the DTD allows each on any type) */
interface ParameterBase extends EmberBaseElement {
	type: ElementType.Parameter
	/** Name. Must be unique within the current scope. */
	identifier?: string
	/** Display name. Used for UI presentation. */
	description?: string
	/** Largest allowed value. */
	maximum?: MinMax
	/** Smallest allowed value. */
	minimum?: MinMax
	/** Permitted access. */
	access?: ParameterAccess
	/** C-style format string to e.g. append a unit, control number of digits displayed etc.. */
	format?: string
	/** List of enumeration value names, separated by line feed `\n`. */
	enumeration?: string
	/** For a device unable to process decimal values, a factor may be used.
	 *  The consumer then has to divide the reported value when it displays it
	 *  and multiply it with this factor when it wants to change the parameter.
	 */
	factor?: number // Integer32
	/** True if the parameter's node is online. */
	isOnline?: boolean
	/** Transform a paramter value to its displayed form. Two formulas must be
	 *  provided, separated by a linefeed `\n`, the first from prvider to consumer
	 *  and the seconds from consumer to provider.
	 */
	formula?: string
	/** Incrementing and decrementing step. (Deprecated - use factor instead.) */
	step?: number // Integer32
	/** Identifies an audio level meter, or any other frequently changing data stream. */
	streamIdentifier?: number // BER readInt
	/** Detailed description of an enumeration. */
	enumMap?: StringIntegerCollection
	/** For streams where each value has more than one component. */
	streamDescriptor?: StreamDescription
	schemaIdentifiers?: string
	templateReference?: RelativeOID
}

/** A parameter of one type: its value and default are of that type's form */
interface TypedParameter<T extends ParameterType> extends ParameterBase {
	/** The parameter's type, which decides the form of its value. */
	parameterType: T
	/** Current value. Enumerations are converted to 0-based indexes. */
	value?: ParameterValue<T>
	/** Default value. */
	defaultValue?: ParameterValue<T>
}

/**
 *  An entity that contains a value: a parameter of one of the types, whose value and default are of that type's form.
 *
 *  A value may be _null_, allowing a provider to inform a consumer that a value
 *  is not currently present.
 */
type Parameter = { [T in ParameterType]: TypedParameter<T> }[ParameterType]

/**
 * Whether a value is of the form a parameter of the type takes (null fits every type, and anything fits a trigger).
 * Values from a provider, or from a caller that doesn't check types, are checked with it where they meet a parameter.
 */
function isValueOfType<T extends ParameterType>(type: T, value: unknown): value is ParameterValue<T> {
	if (value === null || type === ParameterType.Trigger) return true
	switch (type) {
		case ParameterType.Integer:
		case ParameterType.Real:
		case ParameterType.Enum:
			return typeof value === 'number'
		case ParameterType.String:
			return typeof value === 'string'
		case ParameterType.Boolean:
			return typeof value === 'boolean'
		case ParameterType.Octets:
			return Buffer.isBuffer(value)
		default:
			return false // Null: only null
	}
}

class ParameterImpl<T extends ParameterType = ParameterType> implements TypedParameter<T> {
	public readonly type: ElementType.Parameter = ElementType.Parameter
	constructor(
		public parameterType: T,
		public identifier?: string,
		public description?: string,
		public value?: ParameterValue<T>,
		public maximum?: MinMax,
		public minimum?: MinMax,
		public access?: ParameterAccess,
		public format?: string,
		public enumeration?: string,
		public factor?: number, // Integer32
		public isOnline?: boolean,
		public formula?: string,
		public step?: number, // Integer32
		public defaultValue?: ParameterValue<T>,
		public streamIdentifier?: number, // BER readInt
		public enumMap?: StringIntegerCollection,
		public streamDescriptor?: StreamDescription,
		public schemaIdentifiers?: string,
		public templateReference?: RelativeOID
	) {}
}
