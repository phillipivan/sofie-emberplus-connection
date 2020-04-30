import { ElementType, EmberElement } from './EmberElement'
import { Parameter } from './Parameter'
import { Matrix } from './Matrix'
import { Function } from './Function'
import { Node } from './Node'

export { Template }

interface Template extends EmberElement {
	type: ElementType.Template
	element?: Parameter | Node | Matrix | Function
	description?: string
}
