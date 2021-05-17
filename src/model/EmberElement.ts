import { Parameter } from './Parameter'
import { EmberFunction } from './EmberFunction'
import { EmberNode } from './EmberNode'
import { Matrix } from './Matrix'
import { Command } from './Command'
import { Template } from './Template'

export { ElementType, EmberElement, EmberBaseElement, isEmberElement }

/** Type specifyer for ember elements. */
enum ElementType {
	Parameter = 'PARAMETER',
	Node = 'NODE',
	Command = 'COMMAND',
	Matrix = 'MATRIX',
	Function = 'FUNCTION',
	Template = 'TEMPLATE',
}

type EmberElement = Command | EmberFunction | EmberNode | Matrix | Parameter | Template
/** Generic type for all ember elements. */
interface EmberBaseElement {
	type: ElementType
}

function isEmberElement(obj: any): obj is EmberElement {
	if (obj === undefined || obj === null) {
		return false
	}

	const { type } = obj

	if (!type || !Object.values(ElementType as any).includes(type)) {
		return false
	}

	return true
}
