import { EmberElement } from './EmberElement'
import { RelativeOID } from '../types/types'

export {
	TreeElement,
	NumberedTreeNode,
	QualifiedElement,
	NumberedTreeNodeImpl,
	QualifiedElementImpl
}

interface TreeElement<T extends EmberElement> {
	parent?: TreeElement<EmberElement>
	contents: T
	children?: Array<NumberedTreeNode<EmberElement>>
}

interface NumberedTreeNode<T extends EmberElement> extends TreeElement<T> {
	number: number
}

interface QualifiedElement<T extends EmberElement> extends TreeElement<T> {
	path: RelativeOID
}

abstract class TreeElementImpl<T extends EmberElement> implements TreeElement<T> {
	constructor(
		public contents: T,
		public children?: Array<NumberedTreeNode<EmberElement>>,
		public parent?: TreeElement<EmberElement>
	) {}
}

class NumberedTreeNodeImpl<T extends EmberElement> extends TreeElementImpl<T>
	implements NumberedTreeNode<T> {
	constructor(
		public number: number,
		contents: T,
		children?: Array<NumberedTreeNode<EmberElement>>,
		parent?: TreeElement<EmberElement>
	) {
		super(contents, children, parent)
	}
}

class QualifiedElementImpl<T extends EmberElement> extends TreeElementImpl<T>
	implements QualifiedElement<T> {
	constructor(
		public path: RelativeOID,
		contents: T,
		children?: Array<NumberedTreeNode<EmberElement>>,
		parent?: TreeElement<EmberElement>
	) {
		super(contents, children, parent)
	}
}
