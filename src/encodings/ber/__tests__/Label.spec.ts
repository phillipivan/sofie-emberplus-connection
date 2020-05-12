import * as Ber from '../../../Ber'
import { Label } from '../../../model/Label'
import { encodeLabel } from '../encoder/Label'
import { decodeLabel } from '../decoder/Label'
import { literal } from '../../../types/types'

describe('encodings/ber/Label', () => {
	const lbl = literal<Label>({
		basePath: '1.1.2.1.3',
		description: 'Oh what a lovely button'
	})

	test('write and read a label', () => {
		const writer = new Ber.Writer()
		encodeLabel(lbl, writer)
		console.log(writer.buffer)
		const reader = new Ber.Reader(writer.buffer)
		const decoded = decodeLabel(reader)

		expect(decoded).toEqual(lbl)
	})
})
