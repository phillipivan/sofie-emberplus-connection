import * as Ber from '../../Ber'
import { Template } from '../../model/Template'
import { encodeEmberElement } from './EmberElement'

export function encodeTemplate(template: Template, writer: Ber.Writer) {
	if (template.element != null) {
		writer.startSequence(Ber.CONTEXT(1))
		encodeEmberElement(template.element, writer)
		writer.endSequence()
	}

	if (template.description != null) {
		writer.startSequence(Ber.CONTEXT(2))
		writer.writeString(template.description, Ber.BERDataTypes.STRING)
		writer.endSequence()
	}
}
