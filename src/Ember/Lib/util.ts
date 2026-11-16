import { Command, Invoke, isInvoke } from '../../model/Command.js'
import { ElementType, EmberElement } from '../../model/EmberElement.js'
import { EmberNode } from '../../model/index.js'
import { isNumbered, isQualified, QualifiedElementImpl, TreeElement } from '../../model/Tree.js'
import {
	isCommandableElementType,
	isRelativeOID,
	NumberedTreeNode,
	QualifiedCommand,
	QualifiedElement,
	RelativeOID,
	RootElement,
} from '../../types/types.js'

export { isNumbered }

export function getPath(node: RootElement): RelativeOID {
	if (isQualified(node)) {
		return node.path
	} else if (isNumbered(node)) {
		if (node.parent) {
			return childPath(getPath(node.parent), node.number)
		} else {
			return `${node.number}`
		}
	}

	return ''
}

/** A numbered element as a qualified one, given by its path, with the same contents and children */
export function toQualifiedEmberNode<T extends EmberElement>(
	node: NumberedTreeNode<T>
): QualifiedElement<Exclude<T, Command>> {
	const { contents } = node
	// A command is sent within an element, never given by a path of its own
	if (!isNotCommand(contents)) throw new Error('Cannot convert a command to a qualified node')

	return new QualifiedElementImpl(
		getPath(node),
		contents,
		node.children // TODO - do we want the children?
	)
}

/** Whether an element's contents are anything but a command (narrowing a generic type, which checking `type` doesn't) */
function isNotCommand<T extends EmberElement>(contents: T): contents is Exclude<T, Command> {
	return contents.type !== ElementType.Command
}

/**
 * A command for an element, given by its path and kind, as the client sends it. A command can't be sent to another
 * command, or to a template, whose encoding has no children to carry it.
 */
export function toQualifiedCommand<C extends Command>(node: RootElement, command: C): QualifiedCommand<C> {
	const elementType = node.contents.type
	if (!isCommandableElementType(elementType)) {
		throw new Error(`Cannot send a command to a ${elementType.toLowerCase()}`)
	}
	return { path: getPath(node), elementType, command }
}

export function updateProps<T extends object>(oldProps: T, newProps: T, props?: Array<keyof T>): void {
	if (!props) props = Object.keys(newProps) as Array<keyof T>

	for (const key of props) {
		if (newProps[key] !== undefined && newProps[key] !== oldProps[key]) {
			oldProps[key] = newProps[key]
		}
	}
}

/**
 * Check if a value is an error, or wrap it in one
 */
export function normalizeError(e: unknown): Error {
	if (e instanceof Error) {
		return e
	}

	return new Error(String(e))
}

export function isEmptyNode(node: TreeElement<EmberElement>): boolean {
	const isNode = (node: TreeElement<EmberElement>): node is TreeElement<EmberNode> => {
		return node.contents.type === ElementType.Node
	}

	if (!isNode(node)) {
		return false
	}

	if (node.children) {
		return false
	}

	// Check if any of these properties have a value, including empty strings as a node with an empty description is not empty)
	const notEmpty = [
		node.contents.description,
		node.contents.identifier,
		node.contents.isOnline,
		node.contents.isRoot,
		node.contents.schemaIdentifiers,
		node.contents.templateReference,
	].some((value) => value !== undefined && value !== null)

	return !notEmpty
}

/**
 * Whether a tree element's contents are of the given type, narrowing the element with them. (Checking
 * `el.contents.type` narrows the contents, but not the element they are in.)
 */
export function isElementOfType<K extends ElementType, E extends TreeElement<EmberElement>>(
	el: E,
	type: K
): el is E & TreeElement<Extract<EmberElement, { type: K }>> {
	return el.contents.type === type
}

/** Whether a command element is an Invoke, narrowing the element with it */
export function isInvokeElement(el: NumberedTreeNode<Command>): el is NumberedTreeNode<Invoke> {
	return isInvoke(el.contents)
}

/** The path of an element's child: the parent's path and the child's number (for the root, '', the number alone) */
export function childPath(parent: RelativeOID, number: number): RelativeOID {
	return parent === '' ? `${number}` : `${parent}.${number}`
}

/** The path of an element's parent ('' for a top-level element) */
export function parentPath(path: RelativeOID): RelativeOID {
	const parent = path.slice(0, Math.max(path.lastIndexOf('.'), 0))
	return isRelativeOID(parent) ? parent : ''
}
