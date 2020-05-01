import * as Ber from '../../Ber'
import { Matrix, MatrixType, MatrixAddressingMode } from '../../model/Matrix'
import { ElementType } from '../../model/EmberElement'
import { encodeLabel } from './Label'
import { encodeRelativeOID } from './RelativeOID'
import { RelativeOID } from '../../model/RelativeOID'
import { Node } from '../../model/Node'

export function encodeMatrix(matrix: Matrix, writer: Ber.Writer) {
	writer.startSequence(Ber.BERDataTypes.SET)

	writer.writeIfDefined(matrix.identifier, writer.writeString, 0, Ber.BERDataTypes.STRING)
	writer.writeIfDefined(matrix.description, writer.writeString, 1, Ber.BERDataTypes.STRING)
	writer.writeIfDefined(
		matrix.matrixType && matrixTypeToInt(matrix.matrixType),
		writer.writeInt,
		2,
		Ber.BERDataTypes.INTEGER
	)
	writer.writeIfDefined(
		matrix.addressingMode && matrixModeToInt(matrix.addressingMode),
		writer.writeInt,
		3,
		Ber.BERDataTypes.INTEGER
	)
	writer.writeIfDefined(matrix.targetCount, writer.writeInt, 4, Ber.BERDataTypes.INTEGER)
	writer.writeIfDefined(matrix.sourceCount, writer.writeInt, 5, Ber.BERDataTypes.INTEGER)
	writer.writeIfDefined(matrix.maximumTotalConnects, writer.writeInt, 6, Ber.BERDataTypes.INTEGER)
	writer.writeIfDefined(
		matrix.maximumConnectsPerTarget,
		writer.writeInt,
		7,
		Ber.BERDataTypes.INTEGER
	)

	if (matrix.parametersLocation != null) {
		writer.startSequence(Ber.CONTEXT(8))
		let param = Number(matrix.parametersLocation)
		if (isNaN(param)) {
			encodeRelativeOID<Node>(matrix.parametersLocation as RelativeOID<Node>, writer)
		} else {
			writer.writeInt(param)
		}
		writer.endSequence()
	}

	writer.writeIfDefined(matrix.gainParameterNumber, writer.writeInt, 9, Ber.BERDataTypes.INTEGER)

	if (matrix.labels != null) {
		writer.startSequence(Ber.CONTEXT(10))
		writer.startSequence(Ber.BERDataTypes.SEQUENCE)
		for (var i = 0; i < matrix.labels.length; i++) {
			writer.startSequence(Ber.CONTEXT(0))
			encodeLabel(matrix.labels[i], writer)
			writer.endSequence()
		}
		writer.endSequence()
		writer.endSequence()
	}

	writer.writeIfDefined(matrix.schemaIdentifiers, writer.writeString, 11, Ber.BERDataTypes.STRING)

	if (matrix.templateReference != null) {
		encodeRelativeOID(matrix.templateReference, writer)
		// writer.startSequence(Ber.CONTEXT(12));
		// writer.writeRelativeOID(matrix.templateReference, Ber.BERDataTypes.RELATIVE_OID);
		// writer.endSequence();
	}

	writer.endSequence()
}

export function encodeTarget(target: number, writer: Ber.Writer) {
	writer.startSequence(Ber.APPLICATION(14))
	writer.startSequence(Ber.CONTEXT(0))
	writer.writeInt(target, Ber.BERDataTypes.INTEGER)
	writer.endSequence()
	writer.endSequence()
}

export function encodeSource(source: number, writer: Ber.Writer) {
	writer.startSequence(Ber.APPLICATION(15))
	writer.startSequence(Ber.CONTEXT(0))
	writer.writeInt(source, Ber.BERDataTypes.INTEGER)
	writer.endSequence()
	writer.endSequence()
}

export function elementTypeToInt(type: ElementType): number {
	const typeToInt = {
		[ElementType.Parameter]: 0,
		[ElementType.Node]: 1,
		[ElementType.Command]: 2,
		[ElementType.Matrix]: 3,
		[ElementType.Function]: 4,
		[ElementType.Template]: 5
	}

	return typeToInt[type]
}

export function matrixTypeToInt(type: MatrixType): number {
	const typeToInt = {
		[MatrixType.OneToN]: 0,
		[MatrixType.OneToOne]: 1,
		[MatrixType.NToN]: 2
	}

	return typeToInt[type]
}

export function matrixModeToInt(mode: MatrixAddressingMode): number {
	const modeToInt = {
		[MatrixAddressingMode.Linear]: 0,
		[MatrixAddressingMode.NonLinear]: 1
	}

	return modeToInt[mode]
}
