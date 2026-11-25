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
	signalsOf,
	TemplateImpl,
	TreeElement,
} from '../../../model/index.js'
import { RootElement } from '../../../types/types.js'
import {
	childPath,
	isElementOfType,
	isInvokeElement,
	isNumbered,
	parentPath,
	sameValue,
	toQualifiedCommand,
	toQualifiedEmberNode,
	updateProps,
} from '../util.js'

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
		const element: TreeElement<EmberElement> = new NumberedTreeNodeImpl(
			2,
			new MatrixImpl('matrix', signalsOf([1, 2]))
		)

		// Compiles only if the guard narrows `element.contents` to Matrix
		expect(isElementOfType(element, ElementType.Matrix) && element.contents.targets).toEqual(signalsOf([1, 2]))
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

describe('toQualifiedCommand', () => {
	const device = new NumberedTreeNodeImpl(1, new EmberNodeImpl('device'))

	test.each<[string, RootElement, ElementType]>([
		['a numbered node', new NumberedTreeNodeImpl(3, new EmberNodeImpl(), undefined, device), ElementType.Node],
		[
			'a qualified parameter',
			new QualifiedElementImpl('1.3', new ParameterImpl(ParameterType.Integer)),
			ElementType.Parameter,
		],
	])('gives %s, by its path and kind, with the command', (_, element, elementType) => {
		const command = new GetDirectoryImpl()

		expect(toQualifiedCommand(element, command)).toEqual({ path: '1.3', elementType, command })
	})
	// A template's encoding has no children to carry a command, and a command has no path of its own
	test.each<[string, RootElement]>([
		['template', new NumberedTreeNodeImpl(3, new TemplateImpl(), undefined, device)],
		['command', new NumberedTreeNodeImpl(0, new GetDirectoryImpl())],
	])('refuses a %s', (kind, element) => {
		expect(() => toQualifiedCommand(element, new GetDirectoryImpl())).toThrow(`Cannot send a command to a ${kind}`)
	})
})

describe('sameValue', () => {
	test('compares plain values by Object.is', () => {
		expect(sameValue(1, 1)).toBe(true)
		expect(sameValue('a', 'a')).toBe(true)
		expect(sameValue(10n, 10n)).toBe(true)
		expect(sameValue(NaN, NaN)).toBe(true)
		expect(sameValue(0, -0)).toBe(false)
		expect(sameValue(1, '1')).toBe(false)
		expect(sameValue(null, undefined)).toBe(false)
		expect(sameValue(null, {})).toBe(false)
	})

	test('compares Buffers by their bytes', () => {
		expect(sameValue(Buffer.from([1, 2]), Buffer.from([1, 2]))).toBe(true)
		expect(sameValue(Buffer.from([1, 2]), Buffer.from([1, 3]))).toBe(false)
		expect(sameValue(Buffer.from([1, 2]), [1, 2])).toBe(false)
	})

	test('compares Maps by their entries, in order', () => {
		expect(sameValue(new Map([['a', 1]]), new Map([['a', 1]]))).toBe(true)
		expect(sameValue(new Map([['a', 1]]), new Map([['a', 2]]))).toBe(false)
		expect(sameValue(new Map([['a', 1]]), new Map([['b', 1]]))).toBe(false)
		expect(
			sameValue(
				new Map([
					['a', 1],
					['b', 2],
				]),
				new Map([
					['b', 2],
					['a', 1],
				])
			)
		).toBe(false)
		expect(sameValue(signalsOf([1, 2]), signalsOf([1, 2]))).toBe(true)
		expect(sameValue(new Map([[1, { identifier: 'a' }]]), new Map([[1, { identifier: 'b' }]]))).toBe(false)
		expect(sameValue(new Map(), {})).toBe(false)
	})

	test('compares arrays by their items, in order', () => {
		expect(sameValue([1, 2], [1, 2])).toBe(true)
		expect(sameValue([1, 2], [2, 1])).toBe(false)
		expect(sameValue([1], [1, 2])).toBe(false)
		expect(sameValue([], {})).toBe(false)
	})

	test('compares other objects by their own properties, an undefined one as missing, whatever their class', () => {
		expect(sameValue({ a: 1, b: [2] }, { b: [2], a: 1 })).toBe(true)
		expect(sameValue({ a: 1, b: undefined }, { a: 1 })).toBe(true)
		expect(sameValue({ a: 1 }, { a: 1, b: 2 })).toBe(false)
		expect(sameValue({ a: 1, c: 2 }, { a: 1, b: 2 })).toBe(false)
		expect(sameValue(new EmberNodeImpl('a'), { type: ElementType.Node, identifier: 'a' })).toBe(true)
	})

	test('compares elements without following their parent back up the tree', () => {
		const element = () => {
			const parameter = new NumberedTreeNodeImpl(
				1,
				new ParameterImpl(ParameterType.Integer, 'gain', undefined, 5)
			)
			const node = new NumberedTreeNodeImpl(1, new EmberNodeImpl('node'), new Map([[1, parameter]]))
			parameter.parent = node
			return node
		}

		expect(sameValue(element(), element())).toBe(true)
		const other = element()
		other.contents.identifier = 'other'
		expect(sameValue(element(), other)).toBe(false)
	})
})

describe('updateProps', () => {
	test('copies the properties that differ, and returns them with the values they had', () => {
		const old = new ParameterImpl(ParameterType.Integer, 'gain', undefined, 5)
		const update = new ParameterImpl(ParameterType.Integer, 'gain', 'Gain', 7)

		const previous = updateProps(old, update)

		expect(previous).toEqual({ description: undefined, value: 5 })
		expect(Object.keys(previous)).toEqual(['description', 'value'])
		expect(old).toMatchObject({ identifier: 'gain', description: 'Gain', value: 7 })
	})

	test('keeps an object holding the same as before, and returns nothing for it', () => {
		const enumMap = new Map([['unity', 0]])
		const old = new ParameterImpl(ParameterType.Enum, 'mode', undefined, 0)
		old.enumMap = enumMap
		const update = new ParameterImpl(ParameterType.Enum, 'mode', undefined, 0)
		update.enumMap = new Map([['unity', 0]])

		expect(updateProps(old, update)).toEqual({})
		expect(old.enumMap).toBe(enumMap)
	})
})
