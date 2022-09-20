import { EmberElement, ElementType } from '../../../model/EmberElement'
import { Writer } from '../../../Ber'
import { encodeCommand } from './Command'
import { encodeParameter } from './Parameter'
import { encodeNode } from './EmberNode'
import { encodeMatrix } from './Matrix'
import { encodeFunction } from './EmberFunction'
import { encodeTemplate } from './Template'

export function encodeEmberElement(el: EmberElement, writer: Writer): void {
	switch (el.type) {
		case ElementType.Command:
			encodeCommand(el, writer)
			break
		case ElementType.Parameter:
			encodeParameter(el, writer)
			break
		case ElementType.Node:
			encodeNode(el, writer)
			break
		case ElementType.Matrix:
			encodeMatrix(el, writer)
			break
		case ElementType.Function:
			encodeFunction(el, writer)
			break
		case ElementType.Template:
			encodeTemplate(el, writer)
			break
	}
}
