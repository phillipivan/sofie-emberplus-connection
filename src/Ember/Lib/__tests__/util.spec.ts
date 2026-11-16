import { GetDirectoryImpl, InvokeImpl } from '../../../model/Command.js'
import {
	ElementType,
	EmberElement,
	EmberNodeImpl,
	MatrixImpl,
	NumberedTreeNode,
	NumberedTreeNodeImpl,
	ParameterImpl,
	ParameterType,
	QualifiedElementImpl,
	TreeElement,
} from '../../../model/index.js'
import { isElementOfType, isInvokeElement, isNumbered } from '../util.js'

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
