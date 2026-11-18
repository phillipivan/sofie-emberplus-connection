import { RelativeOID } from '../types/types.js'
import { Connection, isConnection } from './Connection.js'
import { ElementType, EmberBaseElement } from './EmberElement.js'
import { Label } from './Label.js'

export {
	Matrix,
	MatrixType,
	MatrixAddressingMode,
	Connections,
	MatrixImpl,
	SignalContents,
	Signals,
	signalsOf,
	isConnections,
	hasSignal,
}

/**
 *  Type of a matrix.
 */
enum MatrixType {
	/** One source may be connected to n targets, but each target must not be
	 *  connected to more than one source. */
	OneToN = 'ONE_TO_N',
	/** One source may be connected to only one target, and each target must
	 *  not be connected to more than one source. */
	OneToOne = 'ONE_TO_ONE',
	/** A source may be connected to n targets, and a target may have n sources
	 *  connected to it. */
	NToN = 'N_TO_N',
}

/**
 *  Addressing mode for a matrix.
 */
enum MatrixAddressingMode {
	/** Signal numbers are row/column indices. */
	Linear = 'LINEAR',
	/** Signal numbers are random. */
	NonLinear = 'NON_LINEAR',
}

/**
 *  Dictionary of targets, indexed by element number. A type, not an interface: an interface has no implicit index
 *  signature, so `Object.values` would not take one without a cast.
 */
type Connections = { [target: number]: Connection }

/** A target's or source's contents (the Glow DTD's SignalContents, all of them optional) */
interface SignalContents {
	/** Name. */
	identifier?: string
	/** Whether the signal is online. Left out, it is (the DTD's default). */
	isOnline?: boolean
	/**
	 * Path of a node holding the signal's labels: the newer of the specification's two ways of labelling signals (the
	 * older is the matrix's `labels`, which a provider should not use alongside it).
	 */
	labelsLocation?: RelativeOID
}

/**
 * A matrix's targets or sources: each signal's contents, by its number, in the order the provider gave them (an empty
 * object for a signal without contents). A Map, so that a number is there once, with its contents beside it.
 */
type Signals = Map<number, SignalContents>

/** Signals of the numbers given, without contents */
function signalsOf(numbers: Iterable<number>): Signals {
	const signals: Signals = new Map()
	for (const number of numbers) signals.set(number, {})
	return signals
}

/**
 *  A two-dimensional array of Boolean values used for eg. signal routing, bus
 *  assignments on mixing consoles etc..
 */
interface Matrix extends EmberBaseElement {
	type: ElementType.Matrix
	/**
	 * The targets, the columns of the matrix, with their contents (identifier, isOnline, labelsLocation). The matrix's
	 * whole collection: a non-linear matrix's targetCount "defines the number of targets contained in the targets
	 * property" (Glow DTD), so a report that has them replaces them.
	 */
	targets?: Signals
	/** The sources, the rows of the matrix, with their contents, as `targets` has the targets */
	sources?: Signals
	/**
	 * Describes the targets active connections. In a consumer's tree: each target's current sources, with the
	 * disposition the provider last reported for the target (pending while a change to it is queued).
	 */
	connections?: Connections
	/**
	 * Name. Required in a matrix's contents, but the contents are optional: a report of connections only, or a request
	 * to change one, has none.
	 */
	identifier?: string
	/** Display name. */
	description?: string
	/** Matrix type. */
	matrixType?: MatrixType
	/** Matrix adressing mode. */
	addressingMode?: MatrixAddressingMode
	/** Linear matrix: number of columns. Nonlinear matrix: number of targets. */
	targetCount?: number
	/** Linear matirx: number of rows. Nonlinear matrix: number of sources. */
	sourceCount?: number
	/** For n-to-n matrices, the maximum number of total connections. */
	maximumTotalConnects?: number
	/** For n-to-n matrices, maximum number of sources for any single target. */
	maximumConnectsPerTarget?: number
	/** Reference to parameters associated with signals, e.g. relative levels. */
	parametersLocation?: RelativeOID | number
	/** For n-to-n matrices, element number of the parameter for gain or ration
	 *  of a connection. */
	gainParameterNumber?: number
	/** Labels for signals. */
	labels?: Array<Label>
	/** List of schemas that the matrix complies with. `\n` separators. */
	schemaIdentifiers?: string
	/** Path of a template containing structure and defaults of this element. */
	templateReference?: RelativeOID
}

class MatrixImpl implements Matrix {
	public readonly type: ElementType.Matrix = ElementType.Matrix
	constructor(
		public identifier?: string,
		public targets?: Signals,
		public sources?: Signals,
		public connections?: Connections,
		public description?: string,
		public matrixType?: MatrixType,
		public addressingMode?: MatrixAddressingMode,
		public targetCount?: number,
		public sourceCount?: number,
		public maximumTotalConnects?: number,
		public maximumConnectsPerTarget?: number,
		public parametersLocation?: RelativeOID | number,
		public gainParameterNumber?: number,
		public labels?: Array<Label>,
		public schemaIdentifiers?: string,
		public templateReference?: RelativeOID
	) {}
}

/** Whether a value is a matrix's connections: an object of connections. For a value from a caller that doesn't check types. */
function isConnections(value: unknown): value is Connections {
	return (
		typeof value === 'object' &&
		value !== null &&
		!Array.isArray(value) &&
		Object.values<unknown>({ ...value }).every((connection) => isConnection(connection))
	)
}

/**
 * Whether a matrix has a target (or source) of the number: one in its targets (sources) list, or, for a linear matrix
 * without one, one from 0 to its targetCount (sourceCount) − 1. (Linear is the default addressing mode.) Undefined when
 * the matrix gives neither, so it can't be told.
 */
function hasSignal(matrix: Matrix, kind: 'target' | 'source', signal: number): boolean | undefined {
	const list = kind === 'target' ? matrix.targets : matrix.sources
	if (list) return list.has(signal)
	const count = kind === 'target' ? matrix.targetCount : matrix.sourceCount
	const linear = (matrix.addressingMode ?? MatrixAddressingMode.Linear) === MatrixAddressingMode.Linear
	if (linear && count !== undefined) return Number.isInteger(signal) && signal >= 0 && signal < count
	return undefined
}
