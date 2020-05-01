import { EmberElement, ElementType } from './EmberElement'
import { RelativeOID } from './RelativeOID'
import { Tree } from './Tree'

export { Qualified }

interface Qualified<T extends EmberElement> {
	value: Tree<T>
	path: string
	getRelativeOID(): RelativeOID<T>
}

interface Qualifed2<T extends EmberElement> {
	value: Omit<T, 'number'>
	path: string
	children?: Array<Tree<T>>
}

import { Node } from '../model/Node'

const node: Qualifed2<Node> = {
	path: '1.2.3',
	value: {
		type: ElementType.Node
	},
	children: []
}
