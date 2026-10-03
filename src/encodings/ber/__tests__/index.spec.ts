import * as Ber from '../../../Ber/index.js'
import { ElementType } from '../../../model/EmberElement.js'
import { EmberNodeImpl } from '../../../model/EmberNode.js'
import { InvocationResultImpl } from '../../../model/InvocationResult.js'
import { Matrix } from '../../../model/Matrix.js'
import { ParameterType } from '../../../model/Parameter.js'
import { NumberedTreeNodeImpl, QualifiedElement, QualifiedElementImpl } from '../../../model/Tree.js'
import { Collection, Root, RootElement, RootType } from '../../../types/types.js'
import { RootBERID } from '../constants.js'
import { guarded } from '../decoder/DecodeResult.js'
import { berDecode, berEncode } from '../index.js'

describe('encoders/Ber/index', () => {
	function roundTrip(res: Root, type: RootType): void {
		const encoded = berEncode(res, type)
		const decoded = guarded(berDecode(encoded))

		expect(decoded).toEqual(res)
	}
	test('InvocationResult', () => {
		const res = new InvocationResultImpl(64, true, [{ value: 6, type: ParameterType.Integer }])

		roundTrip(res, RootType.InvocationResult)
	})
	test('Qualified node', () => {
		const res = { 0: new QualifiedElementImpl('2.3.1', new EmberNodeImpl('Test node')) }
		roundTrip(res, RootType.Elements)
	})
	test('Numbered node', () => {
		const res = { 0: new NumberedTreeNodeImpl(0, new EmberNodeImpl('Test node')) }
		roundTrip(res, RootType.Elements)
	})
	test('Numbered tree', () => {
		const res = {
			0: new NumberedTreeNodeImpl(0, new EmberNodeImpl('Test node'), {
				0: new NumberedTreeNodeImpl(0, new EmberNodeImpl('Test node 1')),
			}),
		}
		if (!res[0].children) {
			throw new Error(`Tree must have children`)
		}
		res[0].children[0].parent = res[0]
		roundTrip(res, RootType.Elements)
	})
	test('Qualified tree', () => {
		const res = {
			0: new QualifiedElementImpl('2.3.1', new EmberNodeImpl('Test node'), {
				0: new NumberedTreeNodeImpl(0, new EmberNodeImpl('Node A'), {}),
			}),
		}
		if (!res[0].children) {
			throw new Error(`Tree must have children`)
		}
		res[0].children[0].parent = res[0]
		roundTrip(res, RootType.Elements)
	})
	test('Unknown root', () => {
		const testBuffer = Buffer.from([Ber.APPLICATION(30)])
		const decoded = berDecode(testBuffer)

		expect(decoded.value).toHaveLength(1)
		expect((decoded.value as Collection<RootElement>)[0].contents.type).toBe(ElementType.Node)
		expect(decoded.errors).toHaveLength(1)
		expect(decoded.errors?.toString()).toMatch(/Unexpected BER application tag '126'/)
	})
	test('Unknown root elements', () => {
		const testBuffer = Buffer.from([RootBERID, 1, Ber.APPLICATION(31)])
		const decoded = berDecode(testBuffer)

		expect(decoded.value).toHaveLength(1)
		expect((decoded.value as Collection<RootElement>)[0].contents.type).toBe(ElementType.Node)
		expect(decoded.errors).toHaveLength(1)
		expect(decoded.errors?.toString()).toMatch(/Unexpected BER application tag '127'/)
	})
	// A connection report captured from a test device: a QualifiedMatrix with a path and connections but no
	// contents, which the Glow DTD makes optional
	test('Qualified matrix without contents', () => {
		const report = Buffer.from(
			'60806b80a0807180a0050d03000502a5803080a0807080a00302010aa1040d02812ca30302010100000000000000000000000000000000',
			'hex'
		)
		const decoded = guarded(berDecode(report)) as Collection<RootElement>
		const matrix = decoded[0] as QualifiedElement<Matrix>

		expect(matrix.path).toBe('0.5.2')
		expect(matrix.contents.type).toBe(ElementType.Matrix)
		expect(matrix.contents.connections?.[10]).toMatchObject({ target: 10, sources: [172] })
	})
})
