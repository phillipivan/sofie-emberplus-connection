import { ElementType, EmberElement } from './EmberElement'
import { Parameter } from './Parameter'
import { Matrix } from './Matrix'
import { Function } from './Function'
import { Node } from './Node'
import { EmberTreeNode } from '../types/types'

export { Template }

interface Template extends EmberElement {
	type: ElementType.Template
	element?: EmberTreeNode<Parameter | Node | Matrix | Function>
	description?: string
}

export class TemplateImpl implements Template {
	public readonly type: ElementType.Template = ElementType.Template
	constructor (
		public number: number,
		public element?: EmberTreeNode<Parameter | Node | Matrix | Function>,
		public description?: string
	) { }
}
