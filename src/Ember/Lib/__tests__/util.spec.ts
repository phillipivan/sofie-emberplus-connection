import { GetDirectoryImpl, InvokeImpl } from '../../../model/Command.js'
import {
	ElementType,
	EmberElement,
	EmberNodeImpl,
	Matrix,
	MatrixImpl,
	NumberedTreeNode,
	NumberedTreeNodeImpl,
	ParameterImpl,
	ParameterType,
	QualifiedElement,
	QualifiedElementImpl,
	TreeElement,
} from '../../../model/index.js'
import { childPath, isElementOfType, isInvokeElement, isNumbered, parentPath, toQualifiedEmberNode } from '../util.js'

describe('element type guards', () => {
	const elements: Array<[ElementType, TreeElement<EmberElement>]> = [
		[ElementType.Node, new NumberedTreeNodeImpl(1, new EmberNodeImpl('node'))],
		[ElementType.Parameter, new QualifiedElementImpl('1.1', new ParameterImpl(ParameterType.Integer, 'gain'))],
		[ElementType.Matrix, new NumberedTreeNodeImpl(2, new MatrixImpl('matrix'))],
		[ElementType.Command, new NumberedTreeNodeImpl(0, new GetDirectoryImpl())],
	]

	test.each(elements)('isElementOfType tells a %s from the others', (type, element) => {
		for (const [other] of elements) expect(isElementOfType(element, other)).toBe(other === type)
	})

	test('isElementOfType narrows the element with its contents', () => {
		const element: TreeElement<EmberElement> = new NumberedTreeNodeImpl(2, new MatrixImpl('matrix', [1, 2]))

		// Compiles only if the guard narrows `element.contents` to Matrix
		expect(isElementOfType(element, ElementType.Matrix) && element.contents.targets).toEqual([1, 2])
	})

	test('isInvokeElement tells an Invoke from other commands', () => {
		const invoke = new NumberedTreeNodeImpl(0, new InvokeImpl({ id: 5, args: [] }))
		const getDirectory = new NumberedTreeNodeImpl(0, new GetDirectoryImpl())

		expect(isInvokeElement(invoke) && invoke.contents.invocation?.id).toBe(5)
		expect(isInvokeElement(getDirectory)).toBe(false)
	})

	test('isNumbered tells numbered elements from qualified ones', () => {
		const numbered: TreeElement<EmberElement> = new NumberedTreeNodeImpl(3, new EmberNodeImpl())
		const qualified: TreeElement<EmberElement> = new QualifiedElementImpl('1.3', new EmberNodeImpl())

		expect(isNumbered(numbered) && (numbered satisfies NumberedTreeNode<EmberElement>).number).toBe(3)
		expect(isNumbered(qualified)).toBe(false)
	})
})

describe('numeric paths', () => {
	test.each([
		['', 3, '3'],
		['1', 3, '1.3'],
		['1.2', 30, '1.2.30'],
	] as const)("childPath('%s', %d) is '%s'", (parent, number, path) => {
		expect(childPath(parent, number)).toBe(path)
	})

	test.each([
		['1.2.3', '1.2'],
		['1', ''],
		['', ''],
	] as const)("parentPath('%s') is '%s'", (path, parent) => {
		expect(parentPath(path)).toBe(parent)
	})
})

describe('toQualifiedEmberNode', () => {
	// The qualified element keeps the contents' type, which was lost to a cast to any qualified element
	test('gives a numbered element its path, with its contents of the same type', () => {
		const device = new NumberedTreeNodeImpl(1, new EmberNodeImpl('device'))
		const matrix = new NumberedTreeNodeImpl(2, new MatrixImpl('matrix'), undefined, device)

		const qualified: QualifiedElement<Matrix> = toQualifiedEmberNode(matrix)

		expect(qualified).toEqual(new QualifiedElementImpl('1.2', matrix.contents))
	})
	test('refuses a command, which has no path of its own', () => {
		expect(() => toQualifiedEmberNode(new NumberedTreeNodeImpl(0, new GetDirectoryImpl()))).toThrow(
			'Cannot convert a command to a qualified node'
		)
	})
})
