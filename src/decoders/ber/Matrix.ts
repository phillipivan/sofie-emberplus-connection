import * as Ber from '../../Ber'
import { Matrix, MatrixImpl } from '../../model/Matrix';
import { EmberTreeNode } from '../../types/types';
import { EmberElement } from '../../model/EmberElement';
import { TreeImpl } from '../../model/Tree';
import { decodeChildren } from './Tree';
import { Connection } from '../../model/Connection';

const MatrixBERID = Ber.APPLICATION(13)

export function decodeMatrix(reader: Ber.Reader): EmberTreeNode<Matrix> {
	const ber = reader.getSequence(MatrixBERID)
	let number: number | null = null
	let targets: Array<number> | undefined = undefined
	let sources: Array<number> | undefined = undefined
	let connections: Array<Connection> | undefined = undefined
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
	return new TreeImpl(
		new MatrixImpl(
			number,
			'',
			targets,
			sources
		),
		undefined,
		kids
	)
}

function decodeMatrixContents(reader: Ber.Reader): Matrix {
	let m: Matrix = {} as Matrix
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

function decodeConnections(reader: Ber.Reader): Array<Connection> {
	// TODO
	return []
}
