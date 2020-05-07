import { ElementType, EmberElement } from './EmberElement'
import { Parameter } from './Parameter'
import { Matrix } from './Matrix'
import { EmberFunction } from './EmberFunction'
import { EmberNode } from './EmberNode'
import { EmberTreeNode } from '../types/types'

export { Template }

interface Template extends EmberElement {
	type: ElementType.Template
	element?: EmberTreeNode<Parameter | EmberNode | Matrix | EmberFunction>
	description?: string
}

export class TemplateImpl implements Template {
	public readonly type: ElementType.Template = ElementType.Template
	constructor (
		public number: number,
		public element?: EmberTreeNode<Parameter | EmberNode | Matrix | EmberFunction>,
		public description?: string
	) { }
}
