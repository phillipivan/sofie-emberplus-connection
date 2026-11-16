import * as Ber from '../../../Ber/index.js'
import { at } from '../../../lib/at.js'
import { Label } from '../../../model/Label.js'
import { guarded } from '../decoder/DecodeResult.js'
import { decodeLabel } from '../decoder/Label.js'
import { encodeLabel } from '../encoder/Label.js'

describe('encodings/ber/Label', () => {
	const lbl: Label = {
		basePath: '1.1.2.1.3',
		description: 'Oh what a lovely button',
	}

	test('write and read a label', () => {
		const writer = new Ber.Writer()
		encodeLabel(lbl, writer)
		const reader = new Ber.Reader(writer.buffer)
		const decoded = guarded(decodeLabel(reader))

		expect(decoded).toEqual(lbl)
	})

	test('write and read a label without description', () => {
		const writer = new Ber.Writer()
		const badLabel: Label = { basePath: '5.4.3.2.1', description: '' }
		encodeLabel(badLabel, writer)
		const badBuffer = writer.buffer.slice(0, writer.buffer.length - 4)
		badBuffer[1] = at(badBuffer, 1) - 4
		const reader = new Ber.Reader(badBuffer)
		const decoded = decodeLabel(reader)

		expect(decoded.value).toEqual(badLabel)
		expect(decoded.errors).toHaveLength(1)
	})

	test('write and read a label with unknown context', () => {
		const writer = new Ber.Writer()
		encodeLabel(lbl, writer)
		writer.buffer[11] = Ber.CONTEXT(13)
		const reader = new Ber.Reader(writer.buffer)
		const decoded = decodeLabel(reader)

		expect(decoded.value).toEqual({ basePath: lbl.basePath, description: '' } satisfies Label)
		expect(decoded.errors).toHaveLength(2)
	})
})
