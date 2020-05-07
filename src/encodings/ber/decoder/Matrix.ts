import * as Ber from '../../../Ber'
import { Matrix, MatrixImpl, Connections, MatrixType, MatrixAddressingMode } from '../../../model/Matrix'
import { EmberTreeNode } from '../../../types/types'
import { EmberElement } from '../../../model/EmberElement'
import { TreeImpl } from '../../../model/Tree'
import { decodeChildren } from './Tree'
import { decodeConnection } from './Connection'
import { decodeLabel } from './Label'
import { MatrixBERID } from '../constants'

export { decodeMatrix }

function decodeMatrix(reader: Ber.Reader): EmberTreeNode<Matrix> {
	const ber = reader.getSequence(MatrixBERID)
	let number: number | null = null
	let targets: Array<number> | undefined = undefined
	let sources: Array<number> | undefined = undefined
	let connections: Connections | undefined = undefined
	let contents: Matrix | null = null
	let kids: Array<EmberTreeNode<EmberElement>> | undefined = undefined
	while (ber.remain > 0) {
		const tag = ber.peek()
		const seq = ber.getSequence(tag!)
		switch (tag) {
			case Ber.CONTEXT(0):
			  number = seq.readInt()
			  break
			case Ber.CONTEXT(1):
				contents = decodeMatrixContents(seq)
			  break
			case Ber.CONTEXT(2):
				kids = decodeChildren(seq)
			  break
			case Ber.CONTEXT(3):
				targets = decodeTargets(seq)
			  break
			case Ber.CONTEXT(4):
				sources = decodeSources(seq)
			  break
			case Ber.CONTEXT(5):
				connections = decodeConnections(seq)
			  break
			default:
				throw new Error(``)
		}
	}
	if (number === null) {
		throw new Error(``)
	}
	if (contents === null) {
		return new TreeImpl(
			new MatrixImpl(
				number,
				'',
				targets,
				sources,
				connections
			),
			undefined,
			kids
		)
	} else {
		return new TreeImpl(
			new MatrixImpl(
				number,
				contents.identifier,
				targets,
				sources,
				connections,
				contents.description,
				contents.matrixType,
				contents.addressingMode,
				contents.targetCount,
				contents.sourceCount,
				contents.maximumTotalConnects,
				contents.maximumConnectsPerTarget,
				contents.parametersLocation,
				contents.gainParameterNumber,
				contents.labels,
				contents.schemaIdentifiers,
				contents.templateReference
			)
		)
	}
}

function decodeMatrixContents(reader: Ber.Reader): Matrix {
	let m: Matrix = {} as Matrix
	const ber = reader.getSequence(Ber.BERDataTypes.SET)
	while (ber.remain > 0) {
		const tag = ber.peek()
		const seq = ber.getSequence(tag!)
		switch (tag) {
			case Ber.CONTEXT(0):
				m.identifier = seq.readString(Ber.BERDataTypes.STRING)
			  break
			case Ber.CONTEXT(1):
				m.description = seq.readString(Ber.BERDataTypes.STRING)
			  break
			case Ber.CONTEXT(2):
				m.matrixType = readMatrixType(seq.readInt())
			  break
			case Ber.CONTEXT(3):
				m.addressingMode = readAddressingMode(seq.readInt())
			  break
			case Ber.CONTEXT(4):
				m.targetCount = seq.readInt()
			  break
			case Ber.CONTEXT(5):
				m.sourceCount = seq.readInt()
			  break
			case Ber.CONTEXT(6):
				m.maximumTotalConnects = seq.readInt()
			  break
			case Ber.CONTEXT(7):
				m.maximumConnectsPerTarget = seq.readInt()
			  break
			case Ber.CONTEXT(8):
				const plTag = seq.peek()
				if (plTag === Ber.BERDataTypes.RELATIVE_OID) {
					m.parametersLocation = seq.readRelativeOID(Ber.BERDataTypes.RELATIVE_OID)
				} else {
					m.parametersLocation = seq.readInt()
				}
			  break
			case Ber.CONTEXT(9):
				m.gainParameterNumber = seq.readInt()
			  break
			case Ber.CONTEXT(10):
				m.labels = []
				const labelSeq = seq.getSequence(Ber.BERDataTypes.SEQUENCE)
				while (labelSeq.remain > 0) {
					const lvSeq = labelSeq.getSequence(Ber.CONTEXT(0))
					m.labels.push(decodeLabel(lvSeq))
				}
			  break
			case Ber.CONTEXT(11):
				m.schemaIdentifiers = seq.readString(Ber.BERDataTypes.STRING)
			  break
			case Ber.CONTEXT(12):
				m.templateReference = seq.readRelativeOID(Ber.BERDataTypes.RELATIVE_OID)
			  break
			default:
				throw new Error(``)
		}
	}
	return m
}

function decodeTargets(reader: Ber.Reader): Array<number> {
	const targets: Array<number> = []
	const ber = reader.getSequence(Ber.BERDataTypes.SEQUENCE)
	while (ber.remain > 0) {
		const seq1 = ber.getSequence(Ber.CONTEXT(0))
		const seq2 = seq1.getSequence(Ber.APPLICATION(14))
		const seq3 = seq2.getSequence(Ber.CONTEXT(0))
		targets.push(seq3.readInt())
	}
	return targets
}

function decodeSources(reader: Ber.Reader): Array<number> {
	const sources: Array<number> = []
	const ber = reader.getSequence(Ber.BERDataTypes.SEQUENCE)
	while (ber.remain > 0) {
		const seq1 = ber.getSequence(Ber.CONTEXT(0))
		const seq2 = seq1.getSequence(Ber.APPLICATION(15))
		const seq3 = seq2.getSequence(Ber.CONTEXT(0))
		sources.push(seq3.readInt())
	}
	return sources
}

function decodeConnections(reader: Ber.Reader): Connections {
	const connections: Connections = {}
	const seq = reader.getSequence(Ber.BERDataTypes.SEQUENCE)
	while (seq.remain > 0) {
		const conSeq = seq.getSequence(Ber.CONTEXT(0))
		const connection = decodeConnection(seq)
		connections[connection.target] = connection
	}
	return connections
}

function readMatrixType(value: number): MatrixType {
	switch (value) {
		case 0: return MatrixType.OneToN
		case 1: return MatrixType.OneToOne
		case 2: return MatrixType.NToN
		default:
			throw new Error(``)
	}
}

function readAddressingMode(value: number): MatrixAddressingMode {
	switch (value) {
		case 0: return MatrixAddressingMode.Linear
		case 1: return MatrixAddressingMode.NonLinear
		default:
			throw new Error(``)
	}
}
