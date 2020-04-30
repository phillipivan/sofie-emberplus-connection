import { EmberElement, ElementType } from '../../model/EmberElement'
import { Writer } from '../../Ber'
import { encodeCommand } from './Command'
import { Command } from '../../model/Command'
import { encodeParameter } from './Parameter'
import { Parameter } from '../../model/Parameter'
import { encodeNode } from './Node'
import { Node } from '../../model/Node'
import { encodeMatrix } from './Matrix'
import { Matrix } from '../../model/Matrix'
import { encodeFunction } from './Function'
import { Function } from '../../model/Function'
import { encodeTemplate } from './Template'
import { Template } from '../../model/Template'

export function encodeEmberElement(el: EmberElement, writer: Writer) {
	switch (el.type) {
		case ElementType.Command:
			encodeCommand(el as Command, writer)
			break
		case ElementType.Parameter:
			encodeParameter(el as Parameter, writer)
			break
		case ElementType.Node:
			encodeNode(el as Node, writer)
			break
		case ElementType.Matrix:
			encodeMatrix(el as Matrix, writer)
			break
		case ElementType.Function:
			encodeFunction(el as Function, writer)
			break
		case ElementType.Template:
			encodeTemplate(el as Template, writer)
			break
	}
}
