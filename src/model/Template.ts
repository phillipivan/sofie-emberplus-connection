import { ElementType, EmberElement } from './EmberElement'
import { Parameter } from './Parameter'
import { Matrix } from './Matrix'

export { Template }

interface Template extends EmberElement {
	type: ElementType.Template
	element?: Parameter | Node | Matrix | Function
	description?: string
}
