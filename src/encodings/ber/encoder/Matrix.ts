/* eslint-disable @typescript-eslint/unbound-method */
import * as Ber from '../../../Ber/index.js'
import { Matrix, MatrixAddressingMode, MatrixType, SignalContents } from '../../../model/Matrix.js'
import { SourceBERID, TargetBERID } from '../constants.js'
import { encodeLabel } from './Label.js'

export const encodeMatrix = (matrix: Matrix, writer: Ber.Writer): void => {
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
	writer.writeIfDefined(matrix.maximumConnectsPerTarget, writer.writeInt, 7, Ber.BERDataTypes.INTEGER)

	if (matrix.parametersLocation != null) {
		writer.startSequence(Ber.CONTEXT(8))
		// A base path is a string, however few parts it has; only a number is the inline parameters node
		if (typeof matrix.parametersLocation === 'number') {
			writer.writeInt(matrix.parametersLocation)
		} else {
			writer.writeRelativeOID(matrix.parametersLocation, Ber.BERDataTypes.RELATIVE_OID)
		}
		writer.endSequence()
	}

	writer.writeIfDefined(matrix.gainParameterNumber, writer.writeInt, 9, Ber.BERDataTypes.INTEGER)

	if (matrix.labels != null) {
		writer.startSequence(Ber.CONTEXT(10))
		writer.startSequence(Ber.BERDataTypes.SEQUENCE)
		for (const label of matrix.labels) {
			writer.startSequence(Ber.CONTEXT(0))
			encodeLabel(label, writer)
			writer.endSequence()
		}
		writer.endSequence()
		writer.endSequence()
	}

	writer.writeIfDefined(matrix.schemaIdentifiers, writer.writeString, 11, Ber.BERDataTypes.STRING)

	if (matrix.templateReference != null) {
		writer.startSequence(Ber.CONTEXT(12))
		writer.writeRelativeOID(matrix.templateReference, Ber.BERDataTypes.RELATIVE_OID)
		writer.endSequence()
	}

	writer.endSequence()
}

export const encodeTarget = (target: number, writer: Ber.Writer, contents?: SignalContents): void =>
	encodeSignal(TargetBERID, target, writer, contents)

export const encodeSource = (source: number, writer: Ber.Writer, contents?: SignalContents): void =>
	encodeSignal(SourceBERID, source, writer, contents)

/** A target or source: its number, and its contents when it has any */
function encodeSignal(berId: number, number: number, writer: Ber.Writer, contents?: SignalContents): void {
	writer.startSequence(berId)
	writer.startSequence(Ber.CONTEXT(0))
	writer.writeInt(number, Ber.BERDataTypes.INTEGER)
	writer.endSequence()
	if (contents && Object.values<unknown>({ ...contents }).some((value) => value !== undefined)) {
		writer.startSequence(Ber.CONTEXT(1))
		writer.startSequence(Ber.BERDataTypes.SET)
		writer.writeIfDefined(contents.identifier, writer.writeString, 0, Ber.BERDataTypes.STRING)
		writer.writeIfDefined(contents.isOnline, writer.writeBoolean, 1, Ber.BERDataTypes.BOOLEAN)
		if (contents.labelsLocation !== undefined) {
			writer.startSequence(Ber.CONTEXT(2))
			writer.writeRelativeOID(contents.labelsLocation, Ber.BERDataTypes.RELATIVE_OID)
			writer.endSequence()
		}
		writer.endSequence()
		writer.endSequence()
	}
	writer.endSequence()
}

export const matrixTypeToInt = (type: MatrixType): number => {
	const typeToInt: Record<MatrixType, number> = {
		[MatrixType.OneToN]: 0,
		[MatrixType.OneToOne]: 1,
		[MatrixType.NToN]: 2,
	}

	return typeToInt[type]
}

export const matrixModeToInt = (mode: MatrixAddressingMode): number => {
	const modeToInt: Record<MatrixAddressingMode, number> = {
		[MatrixAddressingMode.Linear]: 0,
		[MatrixAddressingMode.NonLinear]: 1,
	}

	return modeToInt[mode]
}
