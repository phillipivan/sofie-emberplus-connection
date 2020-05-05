import { EmberElement, ElementType } from './EmberElement'
import { RelativeOID } from './RelativeOID'
import { Tree } from './Tree'

export { Qualified }

interface Qualified<T extends EmberElement> {
	value: Tree<EmberElement, T>
	path: string
	getRelativeOID(): RelativeOID<T>
}

interface Qualifed2<T extends EmberElement> {
	value: EmberTreeNode<T>
	path: string
}

import { Node } from '../model/Node'
import { EmberTreeNode } from '../types/types'

const node: Qualifed2<Node> = {
	value: {
		value: {
			type: ElementType.Node,
			number: 10
		}
	}
}

/*
interface EmberElement
type Qualified<T extends EmberElement> = T & { path: string }
type Unqualified<T extends EmberElement> = T & { number: number }

*/
