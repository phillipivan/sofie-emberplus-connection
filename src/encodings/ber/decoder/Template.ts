import * as Ber from '../../../Ber'
import { Template, TemplateImpl } from '../../../model/Template'
import { Parameter } from '../../../model/Parameter'
import { Matrix } from '../../../model/Matrix'
import { EmberFunction } from '../../../model/EmberFunction'
import { EmberNode } from '../../../model/EmberNode'
import { EmberTreeNode, TreeElement } from '../../../types/types'
import { TemplateBERID, QualifiedTemplateBERID } from '../constants'
import { decodeGenericElement } from './Tree'
import { NumberedTreeNodeImpl, QualifiedElementImpl } from '../../../model/Tree'

export function decodeTemplate(reader: Ber.Reader, isQualified = false): TreeElement<Template> {
	const ber = reader.getSequence(isQualified ? QualifiedTemplateBERID : TemplateBERID)
	let number: number | null = null
	let path: string | null = null
	let element: EmberTreeNode<Parameter | EmberNode | Matrix | EmberFunction> | undefined = undefined
	let description: string | undefined = undefined
	while (ber.remain > 0) {
		const tag = ber.peek()
		if (tag === null) {
			throw new Error(``)
		}
		const seq = ber.getSequence(tag)
		switch (tag) {
			case Ber.CONTEXT(0):
				if (isQualified) path = seq.readRelativeOID()
				else number = seq.readInt()
				break
			case Ber.CONTEXT(1):
				element = decodeGenericElement(seq) as EmberTreeNode<
					Parameter | EmberNode | Matrix | EmberFunction
				>
				break
			case Ber.CONTEXT(2):
				description = seq.readString(Ber.BERDataTypes.STRING)
				break
			default:
				throw new Error(``)
		}
	}
	if (isQualified) {
		if (path === null) {
			throw new Error(``)
		}
		return new QualifiedElementImpl(path, new TemplateImpl(element, description))
	} else {
		if (number === null) {
			throw new Error(``)
		}
		return new NumberedTreeNodeImpl(number, new TemplateImpl(element, description))
	}
}
