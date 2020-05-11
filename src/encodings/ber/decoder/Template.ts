import * as Ber from '../../../Ber'
import { Template, TemplateImpl } from '../../../model/Template'
import { Parameter } from '../../../model/Parameter'
import { Matrix } from '../../../model/Matrix'
import { EmberFunction } from '../../../model/EmberFunction'
import { EmberNode } from '../../../model/EmberNode'
import { EmberTreeNode } from '../../../types/types'
import { TemplateBERID } from '../constants'
import { decodeGenericElement } from './Tree'

export function decodeTemplate(reader: Ber.Reader): Template {
	const ber = reader.getSequence(TemplateBERID)
	let number: number | null = null
	let element: EmberTreeNode<Parameter | EmberNode | Matrix | EmberFunction> | undefined = undefined
	let description: string | undefined = undefined
	while (ber.remain > 0) {
		const tag = ber.peek()
		const seq = ber.getSequence(tag!)
		switch (tag) {
			case Ber.CONTEXT(0):
				number = seq.readInt()
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
	if (number === null) {
		throw new Error(``)
	}
	return new TemplateImpl(number, element, description)
}
