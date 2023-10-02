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

function isEmberElement(obj: unknown): obj is EmberElement {
	if (obj === undefined || obj === null) {
		return false
	}

	if (!(typeof obj === 'object' && 'type' in obj)) return false

	const { type } = obj as { type: unknown }

	if (!type || !Object.values<ElementType>(ElementType).includes(type as any)) {
		return false
	}

	return true
}
