import { RelativeOID, RootElement } from '../types/types.js'
import { EmberElement } from './EmberElement.js'

export {
	Children,
	childrenOf,
	TreeElement,
	NumberedTreeNode,
	QualifiedElement,
	NumberedTreeNodeImpl,
	QualifiedElementImpl,
	isNumbered,
	isQualified,
}

/**
 * An element's children (the Glow DTD's ElementCollection), each by its number, in the order they came; also the tree's
 * top level, the root's children. A Map, so that a number has one child; childrenOf files each under its own number.
 */
type Children = Map<number, NumberedTreeNode<EmberElement>>

/** The elements given, each under its number: of two with one number, the later */
function childrenOf(elements: Iterable<NumberedTreeNode<EmberElement>>): Children {
	const children: Children = new Map()
	for (const element of elements) children.set(element.number, element)
	return children
}

interface TreeElement<T extends EmberElement> {
	parent?: RootElement
	contents: T
	children?: Children
}

interface NumberedTreeNode<T extends EmberElement> extends TreeElement<T> {
	number: number
}

interface QualifiedElement<T extends EmberElement> extends TreeElement<T> {
	path: RelativeOID
	parent: undefined
}

abstract class TreeElementImpl<T extends EmberElement> implements TreeElement<T> {
	constructor(
		public contents: T,
		public children?: Children,
		public parent?: RootElement
	) {}
}

class NumberedTreeNodeImpl<T extends EmberElement> extends TreeElementImpl<T> implements NumberedTreeNode<T> {
	constructor(
		public number: number,
		contents: T,
		children?: Children,
		parent?: RootElement
	) {
		super(contents, children, parent)
	}
}

class QualifiedElementImpl<T extends EmberElement> extends TreeElementImpl<T> implements QualifiedElement<T> {
	parent = undefined

	constructor(
		public path: RelativeOID,
		contents: T,
		children?: Children
	) {
		super(contents, children)
	}
}

/** Whether a tree element is a numbered one (a child, or a top-level element given by number) */
function isNumbered<T extends EmberElement>(el: TreeElement<T>): el is NumberedTreeNode<T> {
	return 'number' in el
}

/** Whether a tree element is a qualified one (a top-level element given by its path) */
function isQualified<T extends EmberElement>(el: TreeElement<T>): el is QualifiedElement<T> {
	return 'path' in el
}
