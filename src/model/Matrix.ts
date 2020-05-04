import { EmberElement, ElementType } from './EmberElement'
import { RelativeOID } from './RelativeOID'
import { Template } from './Template'
import { Connection } from './Connection'
import { Node } from './Node'
import { Label } from './Label'

export { Matrix, MatrixType, MatrixAddressingMode }

enum MatrixType {
	OneToN = 'ONE_TO_N',
	OneToOne = 'ONE_TO_ONE',
	NToN = 'N_TO_N'
}

enum MatrixAddressingMode {
	Linear = 'LINEAR',
	NonLinear = 'NON_LINEAR'
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
	templateReference?: RelativeOID<Template>
}

export class MatrixImpl implements Matrix {
	public readonly type: ElementType.Matrix = ElementType.Matrix
	constructor(
		public number: number,
		public identifier: string,
		public targets?: Array<number>,
		public sources?: Array<number>,
		public connections?: Array<Connection>,
		public description?: string,
		public matrixType?: MatrixType,
		public addressingMode?: MatrixAddressingMode,
		public targetCount?: number,
		public sourceCount?: number,
		public maximumTotalConnects?: number,
		public maximumConnectsPerTarget?: number,
		public parametersLocation?: RelativeOID<Node> | number,
		public gainParameterNumber?: number,
		public labels?: Array<Label>,
		public schemaIdentifiers?: string,
		public templateReference?: RelativeOID<Template>
	) { }
}
