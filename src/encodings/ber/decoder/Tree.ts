import * as Ber from '../../../Ber'
import { EmberElement, ElementType } from '../../../model/EmberElement'
import {
	NumberedTreeNode,
	TreeElement,
	QualifiedElementImpl,
	NumberedTreeNodeImpl
} from '../../../model/Tree'
import { decodeFunctionContent } from './EmberFunction'
import { decodeNode } from './EmberNode'
import { decodeParameter } from './Parameter'
import { decodeTemplate } from './Template'
import {
	QualifiedTemplateBERID,
	QualifiedParameterBERID,
	QualifiedNodeBERID,
	QualifiedMatrixBERID,
	QualifiedFunctionBERID,
	CommandBERID,
	FunctionBERID,
	NodeBERID,
	MatrixBERID,
	ParameterBERID,
	TemplateBERID,
	RootElementsBERID,
	ElementCollectionBERID
} from '../constants'
import { decodeMatrix } from './Matrix'
import { decodeCommand } from './Command'
import { RootElement } from '../../../types/types'
import {
	DecodeResult,
	DecodeOptions,
	defaultDecode,
	makeResult,
	unknownContext,
	safeSet,
	appendErrors
} from './DecodeResult'
import { Command } from '../../../model/Command'

export function decodeChildren(
	reader: Ber.Reader,
	options: DecodeOptions = defaultDecode
): DecodeResult<Array<NumberedTreeNode<EmberElement>>> {
	const ber = reader.getSequence(ElementCollectionBERID)
	const kids = makeResult<Array<NumberedTreeNode<EmberElement>>>(
		[] as Array<NumberedTreeNode<EmberElement>>
	)

	while (ber.remain > 0) {
		const tag = ber.peek()

		if (tag !== Ber.CONTEXT(0)) {
			unknownContext(kids, 'decode children', tag, options)
			continue
		}
		const seq = ber.getSequence(tag)
		const kidEl = decodeGenericElement(seq, options) as DecodeResult<NumberedTreeNode<EmberElement>>
		safeSet(kidEl, kids, (x, y) => {
			y.push(x)
			return y
		})
	}

	return kids
}

export function decodeGenericElement(
	reader: Ber.Reader,
	options: DecodeOptions = defaultDecode
): DecodeResult<TreeElement<EmberElement>> {
	const tag = reader.peek()

	if (tag === null) throw new Error(``)

	const isQualified = isTagQualified(tag)
	const type = tagToElType(tag)

	if (tag === MatrixBERID || tag === QualifiedMatrixBERID) {
		return decodeMatrix(reader, isQualified)
	}
	if (tag === TemplateBERID || tag === QualifiedTemplateBERID) {
		return decodeTemplate(reader, isQualified)
	} else if (tag === CommandBERID) {
		const commandResult: DecodeResult<Command> = decodeCommand(reader, options)
		return makeResult(
			new NumberedTreeNodeImpl(commandResult.value.number, commandResult.value),
			commandResult.errors
		)
	}

	const ber = reader.getSequence(tag)
	let path: string | null = null
	let number: number | null = null
	let contents: EmberElement | null = null
	let children: Array<NumberedTreeNode<EmberElement>> | undefined
	const errors: Array<Error> = []

	while (ber.remain > 0) {
		const tag = ber.peek()
		if (tag === null) {
			unknownContext(errors, 'decode generic element', tag, options)
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
				// parse contents
				switch (type) {
					case ElementType.Command:
						throw new Error('Command is not a generic element')
					case ElementType.Function:
						contents = appendErrors(decodeFunctionContent(seq, options), errors)
						break
					case ElementType.Matrix:
						throw new Error('Matrix is not a generic element')
					case ElementType.Node:
						contents = appendErrors(decodeNode(seq, options), errors)
						break
					case ElementType.Parameter:
						contents = appendErrors(decodeParameter(seq, options), errors)
						break
					case ElementType.Template:
						throw new Error('Template is not a generic element')
					default:
						throw new Error('Unknown element type')
				}
				break
			case Ber.CONTEXT(2):
				children = appendErrors(decodeChildren(seq, options), errors)
				break
			default:
				unknownContext(errors, 'decode generic element', tag, options)
				break
		}
	}

	let el: TreeElement<EmberElement>
	if (isQualified) {
		if (path === null) throw new Error('')
		if (contents === null) throw new Error('')

		el = new QualifiedElementImpl(path, contents, children)
	} else {
		if (number === null) throw new Error('')
		if (contents === null) throw new Error('')

		el = new NumberedTreeNodeImpl(number, contents, children)
	}

	if (children) {
		for (const kid of children) {
			kid.parent = el
		}
	}

	return makeResult<TreeElement<EmberElement>>(el, errors)
}

export function decodeRootElements(
	reader: Ber.Reader,
	options: DecodeOptions = defaultDecode
): DecodeResult<Array<RootElement>> {
	const seq = reader.getSequence(RootElementsBERID)
	const rootEls = makeResult<Array<RootElement>>([])
	while (seq.remain > 0) {
		const tag = seq.peek()
		if (tag !== Ber.CONTEXT(0)) {
			unknownContext(rootEls, 'decode root elements', tag, options)
		}
		const data = seq.getSequence(Ber.CONTEXT(0))
		const rootEl = decodeGenericElement(data, options) as DecodeResult<
			NumberedTreeNode<EmberElement>
		>
		safeSet(rootEl, rootEls, (x, y) => {
			y.push(x)
			return y
		})
	}
	return rootEls
}

function isTagQualified(tag: number): boolean {
	const qualifiedTags = new Set([
		QualifiedTemplateBERID,
		QualifiedParameterBERID,
		QualifiedNodeBERID,
		QualifiedMatrixBERID,
		QualifiedFunctionBERID
	])

	return qualifiedTags.has(tag)
}

function tagToElType(tag: number): ElementType {
	const tags = {
		[CommandBERID]: ElementType.Command,
		[FunctionBERID]: ElementType.Function,
		[NodeBERID]: ElementType.Node,
		[MatrixBERID]: ElementType.Matrix,
		[ParameterBERID]: ElementType.Parameter,
		[TemplateBERID]: ElementType.Template,
		[QualifiedTemplateBERID]: ElementType.Template,
		[QualifiedParameterBERID]: ElementType.Parameter,
		[QualifiedNodeBERID]: ElementType.Node,
		[QualifiedMatrixBERID]: ElementType.Matrix,
		[QualifiedFunctionBERID]: ElementType.Function
	}

	if (!tags[tag]) throw new Error('')

	return tags[tag]
}
