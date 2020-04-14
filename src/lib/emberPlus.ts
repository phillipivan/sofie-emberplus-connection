interface Tree<T> {
	value: T
	children: Array<T>
}

interface EmberElement {
	type: ElementType
	number: number
}

interface Qualified<T extends EmberElement> {
	value: T
	path: string
}

enum ElementType {
	Command = 'COMMAND',
	Node = 'NODE',
	Matrix = 'MATRIX',
	Parameter = 'PARAMETER',
	Function = 'FUNCTION',
	Root = 'ROOT',
	StreamCollection = 'STREAM_COLLECTION',
	Template = 'TEMPLATE'
}

enum ParameterType {
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

enum StreamFormat {
	UInt8 = 'UInt8',
	UInt16BE = 'UInt16BE',
	UInt16LE = 'UInt16LE',
	UInt32BE = 'UInt32BE',
	UInt32LE = 'UInt32LE',
	UInt64BE = 'UInt64BE',
	UInt64LE = 'UInt64LE',
	Int8 = 'Int8',
	Int16BE = 'Int16BE',
	Int16LE = 'Int16LE',
	Int32BE = 'Int32BE',
	Int32LE = 'Int32LE',
	Int64BE = 'Int64BE',
	Int64LE = 'Int64LE',
	Float32BE = 'Float32BE',
	Float32LE = 'Float32LE',
	Float64BE = 'Float64BE',
	Float64LE = 'Float64LE'
}

enum FieldFlags {
	Sparse = 'SPARSE',
	All = 'ALL',
	Default = 'DEFAULT',
	Identifier = 'IDENTIFIER',
	Description = 'DESCRIPTION',
	Tree = 'TREE',
	Value = 'VALUE',
	Connections = 'CONNECTIONS'
}

enum CommandType {
	Subscribe = 'SUBSCRIBE',
	Unsubscribe = 'UNSUBSCRIBE',
	GetDirectory = 'GET_DIRECTORY',
	Invoke = 'INVOKE'
}

enum MatrixType {
	OneToN = 'ONE_TO_N',
	OneToOne = 'ONE_TO_ONE',
	NToN = 'N_TO_N'
}

enum MatrixMode {
	Linear = 'LINEAR',
	NonLinear = 'NON_LINEAR'
}

enum MatrixDisposition {
	Tally = 'TALLY',
	Modified = 'MODIFIED',
	Pending = 'PENDING',
	Locked = 'LOCKED'
}

type StringIntegerCollection = Map<string, number>

interface StringIntegerPair {
	key: string
	value: number // integer
}

interface StreamDescription {
	format: StreamFormat
	offset: number // BER readInt
}

interface StreamEntry {
	identifier: number
	value: string | number | boolean | Buffer
}

interface FunctionArgument {
	type: ParameterType
	name: string
	value?: any
}

interface Innvocation {
	id: number // BER readInt
	args: Array<FunctionArgument>
}

interface InnvocationResult {
	id?: number
	result: Array<FunctionArgument>
}

interface Label {
	basePath: string
	description: string
}

interface Command extends EmberElement {
	type: ElementType.Command
	fieldFlags: FieldFlags
	innvocation: Innvocation
}

interface Node extends EmberElement {
	type: ElementType.Node
	identifier: string
	description: string
	isRoot: boolean
	isOnline: boolean
	schemaIdentifiers: string
}

interface Matrix extends EmberElement {
	type: ElementType.Matrix
	identifier: string
	description: string
	matrixType: MatrixType
	mode: MatrixMode
	targetCount: number // BER readInt
	sourceCount: number // BER readInt
	maximumTotalConnects: number // BER readInt
	maximumConnectsPerTarget: number // BER readInt
	parametersLocation: RelativeOID<Parameter> | number
	gainParameterNumber: number // BER readInt
	labels: Array<Label>
	schemaIdentifiers: string
	templateReference: RelativeOID<Template>
}

// FIXME break down further by ParamterType
interface Parameter extends EmberElement {
	type: ElementType.Parameter
	paramterType: ParameterType
	identifier: string
	description: string
	value: any
	maximum: any
	minimum: any
	access: ParameterAccess
	format: string
	enumeration: string
	factor: number // BER readInt
	isOnline: boolean
	formula: string
	step: number // BER readInt
	default: any
	streamIdentifier: number // BER readInt
	enumMap: StringIntegerCollection
	streamDescriptor: StreamDescription
	schemaIdentifiers: string
}

interface Function extends EmberElement {
	type: ElementType.Function
	identifier: string
	description: string
	args: Array<FunctionArgument>
	result: FunctionArgument
	templateReference: RelativeOID<Template>
}

interface Root extends EmberElement {
	type: ElementType.Root
}

interface StreamCollection extends EmberElement {
	type: ElementType.StreamCollection
	collection: Map<number, StreamEntry>
}

interface Template extends EmberElement {
	type: ElementType.Template
}

type EmberTreeNode = Tree<EmberElement>

function berEncode(el: EmberTreeNode): Buffer { return Buffer.alloc(0) }

function berDecode(b: Buffer): EmberTreeNode { return null }

function isValid(el: EmberTreeNode): boolean { return false }
