import { Writer as Asn1Writer } from '../../../ASN1/ber/writer.js'
import * as Ber from '../../../Ber/index.js'
import { at } from '../../../lib/at.js'
import { ConnectionImpl, ConnectionOperation } from '../../../model/Connection.js'
import { ElementType } from '../../../model/EmberElement.js'
import { EmberNodeImpl } from '../../../model/EmberNode.js'
import { InvocationResultImpl } from '../../../model/InvocationResult.js'
import { connectionsOf, Matrix } from '../../../model/Matrix.js'
import { ParameterType } from '../../../model/Parameter.js'
import { StreamEntryImpl } from '../../../model/StreamEntry.js'
import { childrenOf, NumberedTreeNodeImpl, QualifiedElement, QualifiedElementImpl } from '../../../model/Tree.js'
import { RelativeOID, Root, RootElement, RootType } from '../../../types/types.js'
import {
	ElementCollectionBERID,
	QualifiedMatrixBERID,
	QualifiedNodeBERID,
	QualifiedParameterBERID,
	QualifiedTemplateBERID,
	RootBERID,
	RootElementsBERID,
} from '../constants.js'
import { defaultDecode, guarded } from '../decoder/DecodeResult.js'
import { encodeQualifedElement } from '../encoder/Qualified.js'
import { encodeNumberedElement } from '../encoder/Tree.js'
import { berDecode, berEncode, EncodableRoot } from '../index.js'

describe('encoders/Ber/index', () => {
	const numbered = (number: number, identifier: string) =>
		new NumberedTreeNodeImpl(number, new EmberNodeImpl(identifier))
	const qualified = (path: RelativeOID, identifier: string) =>
		new QualifiedElementImpl(path, new EmberNodeImpl(identifier))
	function roundTrip(...root: EncodableRoot): void {
		const encoded = berEncode(...root)
		const decoded = guarded<Root>(berDecode(encoded))

		expect(decoded).toEqual(root[0])
	}
	// An Ember+ path's numbers are Integer32 (Glow DTD)
	test('berEncode refuses a path number above 2^31 - 1', () => {
		expect(() => berEncode([qualified('1.2147483648', 'node')], RootType.Elements)).toThrow(
			'RELATIVE-OID 1.2147483648 has a number above 2^31 - 1'
		)
	})

	// A qualified element is addressed by its path alone, so one without (missing, empty, or with a number above
	// 2^31 - 1) is skipped, with an error. Its path was '', which the client and the server took as element 0.
	describe('a qualified element without a path', () => {
		const message = (tag: number, path?: string) => {
			const w = new Asn1Writer() // without the Ember+ limit, as a provider might write it
			w.startSequence(RootBERID)
			w.startSequence(RootElementsBERID)
			w.startSequence(Ber.CONTEXT(0))
			w.startSequence(tag)
			if (path !== undefined) {
				w.startSequence(Ber.CONTEXT(0))
				w.writeRelativeOID(path, Ber.BERDataTypes.RELATIVE_OID)
				w.endSequence()
			}
			w.endSequence()
			w.endSequence()
			w.endSequence()
			w.endSequence()
			return w.buffer
		}
		const skipped = (type: string) =>
			`decode root elements: a qualified ${type} without a path addresses no element: skipped`

		test('berDecode keeps one whose path numbers fit in an Integer32', () => {
			const result = berDecode(message(QualifiedNodeBERID, '1.2147483647'))

			expect(result.value).toEqual([new QualifiedElementImpl('1.2147483647', new EmberNodeImpl())])
			expect(result.errors).toHaveLength(0)
		})

		test.each([
			{ name: 'node with a path number of 2^31', tag: QualifiedNodeBERID, path: '1.2147483648', type: 'node' },
			{
				name: 'node with a path number of 2^32 + 5',
				tag: QualifiedNodeBERID,
				path: '1.4294967301',
				type: 'node',
			},
			{ name: 'node with an empty path', tag: QualifiedNodeBERID, path: '', type: 'node' },
			{ name: 'parameter without a path', tag: QualifiedParameterBERID, path: undefined, type: 'parameter' },
			{ name: 'matrix without a path', tag: QualifiedMatrixBERID, path: undefined, type: 'matrix' },
			{ name: 'template without a path', tag: QualifiedTemplateBERID, path: undefined, type: 'template' },
		])('berDecode skips a qualified $name', ({ tag, path, type }) => {
			const result = berDecode(message(tag, path))

			expect(result.value).toEqual([])
			expect(result.errors.map((e) => e.message)).toContain(skipped(type))
		})

		test('berDecode keeps the elements around it', () => {
			const w = new Ber.Writer()
			w.startSequence(RootBERID)
			w.startSequence(RootElementsBERID)
			for (const element of [qualified('1', 'a'), qualified('', 'stray'), qualified('2', 'b')]) {
				w.startSequence(Ber.CONTEXT(0))
				encodeQualifedElement(element, w)
				w.endSequence()
			}
			w.endSequence()
			w.endSequence()

			const result = berDecode(w.buffer)
			expect(result.value).toEqual([qualified('1', 'a'), qualified('2', 'b')])
			expect(result.errors.map((e) => e.message)).toEqual([skipped('node')])
		})

		test('strict decoding refuses one', () => {
			expect(() =>
				berDecode(message(QualifiedNodeBERID, ''), { ...defaultDecode, skipUnexpected: false })
			).toThrow(skipped('node'))
		})
	})

	// berDecode says which kind of root it decoded, so a caller can tell them apart without a cast
	describe('the kind of root', () => {
		const element = new NumberedTreeNodeImpl(1, new EmberNodeImpl('device'))
		const entry = new StreamEntryImpl(4, { type: ParameterType.Integer, value: 9 })
		const result = new InvocationResultImpl(3, true)

		test.each<[string, EncodableRoot]>([
			['elements', [[element], RootType.Elements]], // decoded elements are keyed by their place
			['a stream collection', [[entry], RootType.Streams]],
			['an invocation result', [result, RootType.InvocationResult]],
		])('berDecode gives %s its RootType', (_, root) => {
			const decoded = berDecode(berEncode(...root))

			expect(decoded.rootType).toBe(root[1])
			expect(decoded.value).toEqual(root[0])
		})

		test('berDecode gives a message it cannot read the RootType of elements, with an error', () => {
			const decoded = berDecode(Buffer.from('3000', 'hex'))

			expect(decoded.rootType).toBe(RootType.Elements)
			expect(decoded.errors).toHaveLength(1)
		})

		test('berEncode takes only a root of the RootType it is given', () => {
			// Not called: it only has to compile, or not
			const mismatched = () => {
				// @ts-expect-error a stream collection is not elements
				berEncode([entry], RootType.Elements)
				// @ts-expect-error an invocation result is not a stream collection
				berEncode(result, RootType.Streams)
			}
			expect(typeof mismatched).toBe('function')
		})
	})

	// Every element of a root collection is kept. A numbered element was keyed by its number unless that was 0, and
	// a qualified one, or one numbered 0, by the count so far: one could take another's key and replace it.
	test.each<[string, Array<RootElement>]>([
		['numbered 1, then 0', [numbered(1, 'a'), numbered(0, 'b')]],
		['numbered 2, qualified, then numbered 1', [numbered(2, 'a'), qualified('1.1', 'q'), numbered(1, 'b')]],
		['qualified, then numbered 1', [qualified('1.1', 'q'), numbered(1, 'b')]],
		['two numbered 3', [numbered(3, 'a'), numbered(3, 'b')]],
	])('berDecode keeps every root element: %s', (_, elements) => {
		const decoded = berDecode(berEncode(elements, RootType.Elements))

		expect(decoded.value).toEqual(elements)
	})
	test('berDecode gives the root elements in the order they came', () => {
		const decoded = berDecode(berEncode([numbered(4, 'a'), qualified('1.1', 'q')], RootType.Elements))

		expect(decoded.value).toEqual([numbered(4, 'a'), qualified('1.1', 'q')])
	})

	// The children are numbered elements (ElementCollection): a qualified element among them has no number to be
	// kept by. It was kept under the key undefined, which the tree and the encoder then read as a child.
	describe('a qualified element among the children', () => {
		const message = () => {
			const w = new Ber.Writer()
			w.startSequence(RootBERID)
			w.startSequence(RootElementsBERID)
			w.startSequence(Ber.CONTEXT(0))
			w.startSequence(QualifiedNodeBERID)
			w.startSequence(Ber.CONTEXT(0))
			w.writeRelativeOID('1', Ber.BERDataTypes.RELATIVE_OID)
			w.endSequence()
			w.startSequence(Ber.CONTEXT(2))
			w.startSequence(ElementCollectionBERID)
			w.startSequence(Ber.CONTEXT(0))
			encodeQualifedElement(qualified('1.2', 'stray'), w)
			w.endSequence()
			w.startSequence(Ber.CONTEXT(0))
			encodeNumberedElement(numbered(3, 'kid'), w)
			w.endSequence()
			w.endSequence()
			w.endSequence()
			w.endSequence() // the qualified node
			w.endSequence()
			w.endSequence()
			w.endSequence()
			return w.buffer
		}

		test('is left out, with an error', () => {
			const decoded = berDecode(message())
			const kid = numbered(3, 'kid')
			const parent = new QualifiedElementImpl('1', new EmberNodeImpl(), childrenOf([kid]))
			kid.parent = parent

			expect(decoded.value).toEqual([parent])
			expect(decoded.errors.map((e) => e.message)).toEqual([
				'decode children: qualified element 1.2 is not a child: skipped',
			])
		})
		test('throws when unexpected values are not skipped', () => {
			expect(() => berDecode(message(), { ...defaultDecode, skipUnexpected: false })).toThrow(
				'qualified element 1.2 is not a child'
			)
		})
	})

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
			new NumberedTreeNodeImpl(
				0,
				new EmberNodeImpl('Test node'),
				childrenOf([new NumberedTreeNodeImpl(0, new EmberNodeImpl('Test node 1'))])
			),
		]
		const element = at(res, 0)
		if (!element.children) {
			throw new Error(`Tree must have children`)
		}
		at([...element.children.values()], 0).parent = element
		roundTrip(res, RootType.Elements)
	})
	test('Qualified tree', () => {
		const res = [
			new QualifiedElementImpl(
				'2.3.1',
				new EmberNodeImpl('Test node'),
				childrenOf([new NumberedTreeNodeImpl(0, new EmberNodeImpl('Node A'), new Map())])
			),
		]
		const element = at(res, 0)
		if (!element.children) {
			throw new Error(`Tree must have children`)
		}
		at([...element.children.values()], 0).parent = element
		roundTrip(res, RootType.Elements)
	})
	// A connect request as the specification's examples, Lawo's libember and Ember+ Viewer send it: a QualifiedMatrix
	// with a path and a connection but no contents, which the Glow DTD makes optional
	test('Qualified matrix with only connections', () => {
		const matrix = (contents: Partial<Matrix>) =>
			new QualifiedElementImpl<Matrix>('1.1', {
				type: ElementType.Matrix,
				connections: connectionsOf([new ConnectionImpl(2, [3], ConnectionOperation.Connect)]),
				...contents,
			})

		expect(berEncode([matrix({})], RootType.Elements).toString('hex')).toBe(
			'60236b21a01f711da0040d020101a5153013a011700fa003020102a1030d0103a203020101'
		)
		// anything that belongs in the contents still writes them
		roundTrip([matrix({ identifier: 'matrix' })], RootType.Elements)
	})
	test('Unknown root', () => {
		const testBuffer = Buffer.from([Ber.APPLICATION(30)])
		const decoded = berDecode(testBuffer)

		expect(decoded.value).toHaveLength(1)
		expect(decoded.value).toMatchObject({ 0: { contents: { type: ElementType.Node } } })
		expect(decoded.errors).toHaveLength(1)
		expect(decoded.errors?.toString()).toMatch(/Unexpected BER application tag '126'/)
	})
	// Application tag 30, the highest number a one-byte tag holds (31 and up take the multi-byte form)
	test('Unknown root elements', () => {
		const testBuffer = Buffer.from([RootBERID, 1, Ber.APPLICATION(30)])
		const decoded = berDecode(testBuffer)

		expect(decoded.value).toHaveLength(1)
		expect(decoded.value).toMatchObject({ 0: { contents: { type: ElementType.Node } } })
		expect(decoded.errors).toHaveLength(1)
		expect(decoded.errors?.toString()).toMatch(/Unexpected BER application tag '126'/)
	})
	// A connection report captured from a test device: a QualifiedMatrix with a path and connections but no
	// contents, which the Glow DTD makes optional
	test('Qualified matrix without contents', () => {
		const report = Buffer.from(
			'60806b80a0807180a0050d03000502a5803080a0807080a00302010aa1040d02812ca30302010100000000000000000000000000000000',
			'hex'
		)
		const decoded = guarded<Root>(berDecode(report)) as Array<RootElement>
		const matrix = decoded[0] as QualifiedElement<Matrix>

		expect(matrix.path).toBe('0.5.2')
		expect(matrix.contents.type).toBe(ElementType.Matrix)
		expect(matrix.contents.connections?.get(10)).toMatchObject({ target: 10, sources: [172] })
	})
})
