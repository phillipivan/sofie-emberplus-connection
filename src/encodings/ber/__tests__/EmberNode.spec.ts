import * as Ber from '../../../Ber'
import { EmberNode } from '../../../model/EmberNode'
import { encodeNode } from '../encoder/EmberNode'
import { decodeNode } from '../decoder/EmberNode'
import { ElementType } from '../../../model/EmberElement'

describe('encodings/ber/EmberNode', () => {
	const en = {
		type: ElementType.Node,
		identifier: 'Nodey',
		description: 'Call me nodey',
		isRoot: false,
		isOnline: true,
		schemaIdentifiers: `I'm a schema identifier\nand I'm OK`,
		templateReference: '3.2.1.2'
	} as EmberNode

	test('write and read a node', () => {
		const writer = new Ber.Writer()
		encodeNode(en, writer)
		console.log(writer.buffer)
		const reader = new Ber.Reader(writer.buffer)
		const decoded = decodeNode(reader)

		expect(decoded).toEqual(en)
	})
})
