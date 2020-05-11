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
	RootElementsBERID
} from '../constants'
import { decodeMatrix } from './Matrix'
import { decodeCommand } from './Command'
import { RootElement } from '../../../types/types'

export function decodeChildren(reader: Ber.Reader): Array<NumberedTreeNode<EmberElement>> {
	const ber = reader.getSequence(Ber.BERDataTypes.SEQUENCE)
	const children: Array<NumberedTreeNode<EmberElement>> = []

	while (ber.remain > 0) {
		const tag = ber.peek()
		const seq = ber.getSequence(tag!)

		if (tag !== Ber.CONTEXT(0)) throw new Error()

		children.push(decodeGenericElement(seq) as NumberedTreeNode<EmberElement>)
	}

	return children
}

export function decodeGenericElement(reader: Ber.Reader): TreeElement<EmberElement> {
	const tag = reader.peek()

	if (tag === null) throw new Error()

	const ber = reader.getSequence(tag)
	const isQualified = isTagQualified(tag)
	const type = tagToElType(tag)

	if (tag === MatrixBERID || tag === QualifiedMatrixBERID) {
		return decodeMatrix(reader, isQualified)
	} else if (tag === CommandBERID) {
		return new NumberedTreeNodeImpl(0, decodeCommand(reader)) // TODO - hardcoded to 0??
	}

	let path: string | null = null
	let number: number | null = null
	let contents: EmberElement | null = null
	let children: Array<NumberedTreeNode<EmberElement>> | undefined

	while (ber.remain > 0) {
		const tag = ber.peek()
		const seq = ber.getSequence(tag!)

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
						contents = decodeFunctionContent(seq)
						break
					case ElementType.Matrix:
						throw new Error('Matrix is not a generic element')
					case ElementType.Node:
						contents = decodeNode(seq)
						break
					case ElementType.Parameter:
						contents = decodeParameter(seq)
						break
					case ElementType.Template:
						contents = decodeTemplate(seq)
						break
				}
				break
			case Ber.CONTEXT(2):
				children = decodeChildren(seq)
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

	return el
}

export function decodeRootElements(reader: Ber.Reader): Array<RootElement> {
	const seq = reader.getSequence(RootElementsBERID)
	const rootEls: Array<RootElement> = []
	while (seq.remain > 0) {
		const tag = seq.peek()
		if (tag !== Ber.CONTEXT(0)) {
			throw new Error(``)
		}
		const data = seq.getSequence(Ber.CONTEXT(0))
		const rootEl = decodeGenericElement(data) as RootElement
		rootEls.push(rootEl)
	}
	return rootEls
}

function isTagQualified(tag: number) {
	const qualifiedTags = new Set([
		QualifiedTemplateBERID,
		QualifiedParameterBERID,
		QualifiedNodeBERID,
		QualifiedMatrixBERID,
		QualifiedFunctionBERID
	])

	return qualifiedTags.has(tag)
}

function tagToElType(tag: number) {
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
