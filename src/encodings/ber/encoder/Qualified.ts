import * as Ber from '../../../Ber'
import { EmberElement, ElementType } from '../../../model/EmberElement'
import { encodeTree } from './Tree'
import { QualifiedElement } from '../../../types/types'

// note, this no longer encodes a full element, only the start
export function encodeQualifedElement(el: QualifiedElement<EmberElement>, writer: Ber.Writer) {
	switch (el.contents.type) {
		case ElementType.Function:
			writer.startSequence(Ber.APPLICATION(20))
			break
		case ElementType.Matrix:
			writer.startSequence(Ber.APPLICATION(17))
			break
		case ElementType.Node:
			writer.startSequence(Ber.APPLICATION(10))
			break
		case ElementType.Parameter:
			writer.startSequence(Ber.APPLICATION(9))
			break
		case ElementType.Template:
			writer.startSequence(Ber.APPLICATION(25))
			break
	}

	writer.startSequence(Ber.CONTEXT(0))
	writer.writeString(el.path, Ber.BERDataTypes.SEQUENCE)
	writer.endSequence()

	encodeTree(el, writer)
}
