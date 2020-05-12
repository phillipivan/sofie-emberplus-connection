import * as Ber from '../../../Ber'
import {
	Matrix,
	MatrixImpl,
	Connections,
	MatrixType,
	MatrixAddressingMode
} from '../../../model/Matrix'
import { EmberTreeNode, RelativeOID } from '../../../types/types'
import { EmberElement } from '../../../model/EmberElement'
import { decodeChildren } from './Tree'
import { decodeConnection } from './Connection'
import { decodeLabel } from './Label'
import { MatrixBERID, TargetBERID, SourceBERID } from '../constants'
import { QualifiedElementImpl, NumberedTreeNodeImpl, TreeElement } from '../../../model/Tree'
import {
	DecodeOptions,
	defaultDecode,
	DecodeResult,
	appendErrors,
	makeResult,
	unexpected,
	unknownContext,
	check
} from './DecodeResult'
import { Label } from '../../../model/Label'

export { decodeMatrix }

function decodeMatrix(
	reader: Ber.Reader,
	isQualified = false,
	options: DecodeOptions = defaultDecode
): DecodeResult<TreeElement<Matrix>> {
	const ber = reader.getSequence(MatrixBERID)
	let number: number | null = null
	let path: RelativeOID | null = null
	let targets: Array<number> | undefined = undefined
	let sources: Array<number> | undefined = undefined
	let connections: Connections | undefined = undefined
	let contents: Matrix | null = null
	let kids: Array<EmberTreeNode<EmberElement>> | undefined = undefined
	const errors: Array<Error> = []
	while (ber.remain > 0) {
		const tag = ber.peek()
		if (tag === null) {
			unknownContext(errors, 'decode matrix', tag, options)
			continue
		}
		const seq = ber.getSequence(tag)
		switch (tag) {
			case Ber.CONTEXT(0):
				if (isQualified) {
					path = seq.readRelativeOID()
				} else {
					number = seq.readInt()
				}
				break
			case Ber.CONTEXT(1):
				contents = appendErrors(decodeMatrixContents(seq), errors)
				break
			case Ber.CONTEXT(2):
				kids = appendErrors(decodeChildren(seq, options), errors)
				break
			case Ber.CONTEXT(3):
				targets = appendErrors(decodeTargets(seq, options), errors)
				break
			case Ber.CONTEXT(4):
				sources = appendErrors(decodeSources(seq, options), errors)
				break
			case Ber.CONTEXT(5):
				connections = appendErrors(decodeConnections(seq, options), errors)
				break
			default:
				unknownContext(errors, 'decode matrix', tag, options)
				break
		}
	}
	contents = check(contents, 'decode matrix', 'contents', new MatrixImpl(''), errors, options)
	contents.targets = targets
	contents.sources = sources
	contents.connections = connections

	let el: TreeElement<Matrix>
	if (isQualified) {
		path = check(path, 'decode matrix', 'path', '', errors, options)
		el = new QualifiedElementImpl(path, contents, kids)
	} else {
		number = check(number, 'decode matrix', 'number', -1, errors, options)
		el = new NumberedTreeNodeImpl(number, contents, kids)
	}

	if (kids) {
		for (const kiddo of kids) {
			kiddo.parent = el
		}
	}

	return makeResult(el, errors)
}

function decodeMatrixContents(
	reader: Ber.Reader,
	options: DecodeOptions = defaultDecode
): DecodeResult<Matrix> {
	const ber = reader.getSequence(Ber.BERDataTypes.SET)
	let plTag: number | null
	let identifier: string | undefined = undefined
	let description: string | undefined = undefined
	let matrixType: MatrixType | undefined = undefined
	let addressingMode: MatrixAddressingMode | undefined = undefined
	let targetCount: number | undefined = undefined
	let sourceCount: number | undefined = undefined
	let maximumTotalConnects: number | undefined = undefined
	let maximumConnectsPerTarget: number | undefined = undefined
	let parametersLocation: string | number | undefined = undefined
	let gainParameterNumber: number | undefined = undefined
	let labels: Array<Label> | undefined = undefined
	let schemaIdentifiers: string | undefined = undefined
	let templateReference: string | undefined = undefined
	let labelSeq: Ber.Reader
	const errors: Array<Error> = []
	while (ber.remain > 0) {
		const tag = ber.peek()
		if (tag === null) {
			unknownContext(errors, 'decode matrix contents', tag, options)
			continue
		}
		const seq = ber.getSequence(tag)
		switch (tag) {
			case Ber.CONTEXT(0):
				identifier = seq.readString(Ber.BERDataTypes.STRING)
				break
			case Ber.CONTEXT(1):
				description = seq.readString(Ber.BERDataTypes.STRING)
				break
			case Ber.CONTEXT(2):
				matrixType = appendErrors(readMatrixType(seq.readInt(), options), errors)
				break
			case Ber.CONTEXT(3):
				addressingMode = appendErrors(readAddressingMode(seq.readInt(), options), errors)
				break
			case Ber.CONTEXT(4):
				targetCount = seq.readInt()
				break
			case Ber.CONTEXT(5):
				sourceCount = seq.readInt()
				break
			case Ber.CONTEXT(6):
				maximumTotalConnects = seq.readInt()
				break
			case Ber.CONTEXT(7):
				maximumConnectsPerTarget = seq.readInt()
				break
			case Ber.CONTEXT(8):
				plTag = seq.peek()
				if (plTag === Ber.BERDataTypes.RELATIVE_OID) {
					parametersLocation = seq.readRelativeOID(Ber.BERDataTypes.RELATIVE_OID)
				} else {
					parametersLocation = seq.readInt()
				}
				break
			case Ber.CONTEXT(9):
				gainParameterNumber = seq.readInt()
				break
			case Ber.CONTEXT(10):
				labels = []
				labelSeq = seq.getSequence(Ber.BERDataTypes.SEQUENCE)
				while (labelSeq.remain > 0) {
					const lvSeq = labelSeq.getSequence(Ber.CONTEXT(0))
					const lvVal = appendErrors(decodeLabel(lvSeq, options), errors)
					labels.push(lvVal)
				}
				break
			case Ber.CONTEXT(11):
				schemaIdentifiers = seq.readString(Ber.BERDataTypes.STRING)
				break
			case Ber.CONTEXT(12):
				templateReference = seq.readRelativeOID(Ber.BERDataTypes.RELATIVE_OID)
				break
			default:
				unknownContext(errors, 'decode mattric contents', tag, options)
				break
		}
	}
	identifier = check(identifier, 'decode matrix contents', 'identifier', '', errors, options)
	return makeResult(
		new MatrixImpl(
			identifier,
			undefined, // targets
			undefined, // sources
			undefined, // connections
			description,
			matrixType,
			addressingMode,
			targetCount,
			sourceCount,
			maximumTotalConnects,
			maximumConnectsPerTarget,
			parametersLocation,
			gainParameterNumber,
			labels,
			schemaIdentifiers,
			templateReference
		),
		errors
	)
}

function decodeTargets(
	reader: Ber.Reader,
	_options: DecodeOptions = defaultDecode
): DecodeResult<Array<number>> {
	const targets: Array<number> = []
	const ber = reader.getSequence(Ber.BERDataTypes.SEQUENCE)
	while (ber.remain > 0) {
		const seq1 = ber.getSequence(Ber.CONTEXT(0))
		const seq2 = seq1.getSequence(TargetBERID)
		const seq3 = seq2.getSequence(Ber.CONTEXT(0))
		targets.push(seq3.readInt())
	}
	return makeResult(targets)
}

function decodeSources(
	reader: Ber.Reader,
	_options: DecodeOptions = defaultDecode
): DecodeResult<Array<number>> {
	const sources: Array<number> = []
	const ber = reader.getSequence(Ber.BERDataTypes.SEQUENCE)
	while (ber.remain > 0) {
		const seq1 = ber.getSequence(Ber.CONTEXT(0))
		const seq2 = seq1.getSequence(SourceBERID)
		const seq3 = seq2.getSequence(Ber.CONTEXT(0))
		sources.push(seq3.readInt())
	}
	return makeResult(sources)
}

function decodeConnections(
	reader: Ber.Reader,
	options: DecodeOptions = defaultDecode
): DecodeResult<Connections> {
	const connections = makeResult<Connections>({})
	const seq = reader.getSequence(Ber.BERDataTypes.SEQUENCE)
	while (seq.remain > 0) {
		const conSeq = seq.getSequence(Ber.CONTEXT(0))
		const connection = appendErrors(decodeConnection(conSeq, options), connections)
		connections.value[connection.target] = connection
	}
	return connections
}

function readMatrixType(
	value: number,
	options: DecodeOptions = defaultDecode
): DecodeResult<MatrixType> {
	switch (value) {
		case 0:
			return makeResult(MatrixType.OneToN)
		case 1:
			return makeResult(MatrixType.OneToOne)
		case 2:
			return makeResult(MatrixType.NToN)
		default:
			return unexpected(
				[],
				'read matrix type',
				`unexpected matrix type '${value}'`,
				MatrixType.NToN,
				options
			)
	}
}

function readAddressingMode(
	value: number,
	options: DecodeOptions = defaultDecode
): DecodeResult<MatrixAddressingMode> {
	switch (value) {
		case 0:
			return makeResult(MatrixAddressingMode.Linear)
		case 1:
			return makeResult(MatrixAddressingMode.NonLinear)
		default:
			return unexpected(
				[],
				'read addressing mode',
				`unexpected addressing mode '${value}'`,
				MatrixAddressingMode.Linear,
				options
			)
	}
}
