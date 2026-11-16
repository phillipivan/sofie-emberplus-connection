import { Command } from './Command.js'
import { EmberFunction } from './EmberFunction.js'
import { EmberNode } from './EmberNode.js'
import { Matrix } from './Matrix.js'
import { Parameter } from './Parameter.js'
import { Template } from './Template.js'

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

/**
 * Type guard for an element's contents: true for an object whose `type` is one of the ElementType values. It checks
 * that field only, not the rest of the element.
 *
 * @param obj - value to check
 * @returns whether the value is an EmberElement
 */
function isEmberElement(obj: unknown): obj is EmberElement {
	if (obj === undefined || obj === null) {
		return false
	}

	if (!(typeof obj === 'object' && 'type' in obj)) return false

	const { type } = obj

	if (!type || !Object.values<ElementType>(ElementType).includes(type as any)) {
		return false
	}

	return true
}
