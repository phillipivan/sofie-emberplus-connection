interface Tree<T> {
	value: T
	children?: Array<T>
}

interface EmberElement {
	type: ElementType
	number: number
}

interface Qualified<T extends EmberElement> {
	value: T
	path: string
	getRelativeOID(): RelativeOID<T>
}

interface RelativeOID<T extends EmberElement> {
	resolve(): T
}

enum ElementType {
	Parameter = 'PARAMETER',
	Node = 'NODE',
	Command = 'COMMAND',
	Matrix = 'MATRIX',
	Function = 'FUNCTION',
	Template = 'TEMPLATE'
}

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
	Subscribe = 30,
	Unsubscribe = 31,
	GetDirectory = 32,
	Invoke = 33
}

enum MatrixType {
	OneToN = 'ONE_TO_N',
	OneToOne = 'ONE_TO_ONE',
	NToN = 'N_TO_N'
}

enum MatrixAddressingMode {
	Linear = 'LINEAR',
	NonLinear = 'NON_LINEAR'
}

enum ConnectionOperation {
	Absolute = 'ABSOLUTE', // default. sources contains absolute information
	Connect = 'CONNECT', // nToN only. sources contains sources to add to connection
	disconnect = 'DISCONNECT' // nToN only. sources contains sources to remove from connection
}

enum ConnectionDisposition {
	Tally = 'TALLY',
	Modified = 'MODIFIED',
	Pending = 'PENDING',
	Locked = 'LOCKED'
}

// number is either Integer64 or REAL
type EmberValue = number | string | boolean | Buffer | null
type MinMax = number | null

type StringIntegerCollection = Map<string, number>

interface StreamDescription {
	format: StreamFormat
	offset: number // Integer32
}

interface StreamEntry {
	identifier: number // Integer32
	value: EmberValue // not null
}

interface FunctionArgument {
	type: ParameterType
	name: string
}

interface Invocation {
	id?: number // BER readInt
	args: Array<EmberValue>
}

interface InvocationResult {
	id: number
	success?: boolean
	result?: Array<EmberValue>
}

interface Label {
	basePath: string // might be RelativeOID<?>
	description: string
}

interface Connection {
	target: number // Integer32
	sources?: Array<number> // Integer32s
	operation?: ConnectionOperation
	disposition?: ConnectionDisposition
}

interface Command extends EmberElement {
	type: ElementType.Command
}

interface Subscribe extends Command {
	number: CommandType.Subscribe
}

interface Unsubscribe extends Command {
	number: CommandType.Unsubscribe
}

interface GetDirectory extends Command {
  number: CommandType.GetDirectory
	dirFieldMask?: FieldFlags
}

interface Invoke extends Command {
	number: CommandType.Invoke
	invocation?: Invocation
}

interface Node extends EmberElement {
	type: ElementType.Node
	identifier?: string
	description?: string
	isRoot?: boolean
	isOnline?: boolean
	schemaIdentifiers?: string
	templateReference: RelativeOID<Template>
}

interface Matrix extends EmberElement {
	type: ElementType.Matrix
	targets?: Array<number> // Integer32
	sources?: Array<number> // Integer32
	connections?: Array<Connection> // Integer32
	identifier: string
	description?: string
	matrixType?: MatrixType
	addressingMode?: MatrixAddressingMode
	targetCount?: number // Integer32 - linear: matrix X size, nonlinear - number of targets
	sourceCount?: number // Integer32 - linear: matrix Y size, nonLinear - number of sources
	maximumTotalConnects?: number // Integer32 - nToN: max number of set connections
	maximumConnectsPerTarget?: number // Integer32 - max number of connects per target
	parametersLocation?: RelativeOID<Node> | number // absolute of index reference to parameters - details tbc
	gainParameterNumber?: number // Integer32 - nToN: number of connection gain parameter
	labels?: Array<Label>
	schemaIdentifiers?: string
	templateReference: RelativeOID<Template>
}

// FIXME break down further by ParamterType
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

interface Function extends EmberElement {
	type: ElementType.Function
	identifier?: string
	description?: string
	args?: Array<FunctionArgument>
	result?: Array<FunctionArgument>
	templateReference?: RelativeOID<Template>
}

interface Template extends EmberElement {
	type: ElementType.Template
	element?: Parameter | Node | Matrix | Function
	description?: string
}

type EmberTreeNode = Tree<EmberElement>

type RootElement = EmberTreeNode | Qualified<Parameter> | Qualified<Node> | Qualified<Matrix> | Qualified<Function> | Qualified<Template>

type Root = Array<RootElement> | Array<StreamEntry> | InvocationResult

function berEncode(el: EmberTreeNode): Buffer { return Buffer.alloc(0) }

function berDecode(b: Buffer): EmberTreeNode { return null }

function isValid(el: EmberTreeNode): boolean { return false }
