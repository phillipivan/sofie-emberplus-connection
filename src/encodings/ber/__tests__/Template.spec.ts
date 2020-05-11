import * as Ber from '../../../Ber'
import { ParameterType } from '../../../model/Parameter'
import { ElementType } from '../../../model/EmberElement'
import { Template } from '../../../model/Template'
import { encodeTemplate } from '../encoder/Template'
import { decodeTemplate } from '../decoder/Template'

describe('encodings/ber/Parameter', () => {
	const tmpl = {
		type: ElementType.Template,
		parameterType: ParameterType.String
	} as Template

	function roundtripTemplate(tmpl: Template): void {
		const writer = new Ber.Writer()
		encodeTemplate(tmpl, writer)
		console.log(writer.buffer)
		const reader = new Ber.Reader(writer.buffer)
		const decoded = decodeTemplate(reader)

		expect(decoded).toEqual(tmpl)
	}

	test('write and read a parameter', () => {
		roundtripTemplate(tmpl)
	})
})
