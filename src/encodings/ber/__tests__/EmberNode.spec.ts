import * as Ber from '../../../Ber/index.js'
import { ElementType } from '../../../model/EmberElement.js'
import { EmberNode } from '../../../model/EmberNode.js'
import { guarded } from '../decoder/DecodeResult.js'
import { decodeNode } from '../decoder/EmberNode.js'
import { decodeGenericElement } from '../decoder/Tree.js'
import { encodeNode } from '../encoder/EmberNode.js'
import { berDecode } from '../index.js'

const indefiniteLength = Buffer.from([
	0x60,
	0x80, // Root - length 60
	0x6b,
	0x80, // RootElements -- length 56
	0xa0,
	0x80, // First element - 52
	0x6a,
	0x80, // Qualified Node - length 48
	0xa0,
	0x03,
	0x0d,
	0x01,
	0x01,
	0xa2,
	0x80, // Children length 39
	0x64,
	0x80, // ElementCollection length 35
	0xa0,
	0x80, // Element length 31
	0x63,
	0x80, // Node length 27
	0xa0,
	0x03,
	0x02,
	0x01,
	0x01,
	0xa1,
	0x80, // Node Content length 20
	0x31,
	0x80, // set length 16 - Ber library measures 18
	0xa0,
	0x09,
	0x0c,
	0x07,
	0x53,
	0x6f,
	0x75,
	0x72,
	0x63,
	0x65,
	0x73,
	0xa3,
	0x03,
	0x01,
	0x01,
	0xff,
	0x00,
	0x00,
	0x00,
	0x00,
	0x00,
	0x00,
	0x00,
	0x00,
	0x00,
	0x00,
	0x00,
	0x00,
	0x00,
	0x00,
	0x00,
	0x00,
	0x00,
	0x00,
	0x00,
	0x00,
])

const nodeOnly = Buffer.from([
	0x63,
	0x80, // Node length 27
	0xa0,
	0x03,
	0x02,
	0x01,
	0x01,
	0xa1,
	0x80, // Node Content length 20
	0x31,
	0x80, // set length 16 - Ber library measures 18
	0xa0,
	0x09,
	0x0c,
	0x07,
	0x53,
	0x6f,
	0x75,
	0x72,
	0x63,
	0x65,
	0x73,
	0xa3,
	0x03,
	0x01,
	0x01,
	0xff,
	0x00,
	0x00,
	0x00,
	0x00,
	0x00,
	0x00,
])

describe('encodings/ber/EmberNode', () => {
	const en: EmberNode = {
		type: ElementType.Node,
		identifier: 'Nodey',
		description: 'Call me nodey',
		isRoot: false,
		isOnline: true,
		schemaIdentifiers: `I'm a schema identifier\nand I'm OK`,
		templateReference: '3.2.1.2',
	}

	test('write and read a node', () => {
		const writer = new Ber.Writer()
		encodeNode(en, writer)
		const reader = new Ber.Reader(writer.buffer)
		const decoded = guarded(decodeNode(reader))

		expect(decoded).toEqual(en)
	})

	// An ElementCollection is a SEQUENCE of elements, so a number can come twice: the later is kept, with an error
	test('a child listed twice is kept once, with an error', () => {
		const w = new Ber.Writer()
		const node = (number: number, identifier: string) => {
			w.startSequence(Ber.CONTEXT(0))
			w.startSequence(Ber.APPLICATION(3)) // Node
			w.startSequence(Ber.CONTEXT(0))
			w.writeInt(number)
			w.endSequence()
			w.startSequence(Ber.CONTEXT(1))
			w.startSequence(Ber.BERDataTypes.SET)
			w.startSequence(Ber.CONTEXT(0))
			w.writeString(identifier, Ber.BERDataTypes.STRING)
			w.endSequence()
			w.endSequence()
			w.endSequence()
			w.endSequence()
			w.endSequence()
		}
		w.startSequence(Ber.APPLICATION(3)) // Node 1
		w.startSequence(Ber.CONTEXT(0))
		w.writeInt(1)
		w.endSequence()
		w.startSequence(Ber.CONTEXT(2)) // children
		w.startSequence(Ber.APPLICATION(4)) // ElementCollection
		node(5, 'first')
		node(6, 'other')
		node(5, 'later')
		w.endSequence()
		w.endSequence()
		w.endSequence()
		const decoded = decodeGenericElement(new Ber.Reader(w.buffer))

		const children = [...(decoded.value.children?.values() ?? [])]
		expect(children.map((c) => [c.number, c.contents.type === ElementType.Node && c.contents.identifier])).toEqual([
			[5, 'later'],
			[6, 'other'],
		])
		expect(decoded.errors.map((e) => e.message)).toEqual(['decode children: child 5 is listed more than once'])
	})

	test('decode indefinite length', () => {
		const decoded = berDecode(indefiniteLength)

		expect(decoded.errors).toHaveLength(0)
	})

	test('decode indefinite node only', () => {
		const reader = new Ber.Reader(nodeOnly)
		const decoded = decodeGenericElement(reader)
		expect(decoded.errors).toHaveLength(0)
	})
})
