import { InvocationResultImpl } from '../../../model/InvocationResult'
import { ParameterType } from '../../../model/Parameter'
import { Root, RootType } from '../../../types/types'
import { berEncode, berDecode } from '..'
import { QualifiedElementImpl, NumberedTreeNodeImpl } from '../../../model/Tree'
import { EmberNodeImpl } from '../../../model/EmberNode'

describe('encoders/Ber/index', () => {
	function roundTrip(res: Root, type: RootType): void {
		const encoded = berEncode(res, type)
		const decoded = berDecode(encoded)

		expect(decoded).toEqual(res)
	}
	test('InvocationResult', () => {
		const res = new InvocationResultImpl(64, true, [{ value: 6, type: ParameterType.Integer }])

		roundTrip(res, RootType.InvocationResult)
	})
	test('Qualified node', () => {
		const res = [new QualifiedElementImpl('2.3.1', new EmberNodeImpl('Test node'))]
		roundTrip(res, RootType.Elements)
	})
	test('Numbered node', () => {
		const res = [new NumberedTreeNodeImpl(0, new EmberNodeImpl('Test node'))]
		roundTrip(res, RootType.Elements)
	})
	test('Numbered tree', () => {
		const res = [
			new NumberedTreeNodeImpl(0, new EmberNodeImpl('Test node'), [
				new NumberedTreeNodeImpl(0, new EmberNodeImpl('Test node 1'))
			])
		]
		if (!res[0].children) {
			fail(`Tree must have children`)
		}
		res[0].children[0].parent = res[0]
		roundTrip(res, RootType.Elements)
	})
	test('Qualified tree', () => {
		const res = [
			new QualifiedElementImpl('2.3.1', new EmberNodeImpl('Test node'), [
				new NumberedTreeNodeImpl(0, new EmberNodeImpl('Node A'), [])
			])
		]
		if (!res[0].children) {
			fail(`Tree must have children`)
		}
		res[0].children[0].parent = res[0]
		roundTrip(res, RootType.Elements)
	})
})
