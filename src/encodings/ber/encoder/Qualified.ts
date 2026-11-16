import * as Ber from '../../../Ber/index.js'
import { Command } from '../../../model/Command.js'
import { ElementType, EmberElement } from '../../../model/EmberElement.js'
import { QualifiedCommand, QualifiedElement, RelativeOID } from '../../../types/types.js'
import {
	ElementCollectionBERID,
	QualifiedFunctionBERID,
	QualifiedMatrixBERID,
	QualifiedNodeBERID,
	QualifiedParameterBERID,
	QualifiedTemplateBERID,
} from '../constants.js'
import { encodeCommand } from './Command.js'
import { encodeTree } from './Tree.js'

export function encodeQualifedElement(el: QualifiedElement<Exclude<EmberElement, Command>>, writer: Ber.Writer): void {
	startQualified(el.contents.type, el.path, writer)
	encodeTree(el, writer) // the rest, and the end
}

/** A command for an element given by its path: the path and, as the element's only child, the command */
export function encodeQualifiedCommand(request: QualifiedCommand, writer: Ber.Writer): void {
	startQualified(request.elementType, request.path, writer)

	writer.startSequence(Ber.CONTEXT(2)) // start children
	writer.startSequence(ElementCollectionBERID)
	writer.startSequence(Ber.CONTEXT(0))
	encodeCommand(request.command, writer)
	writer.endSequence()
	writer.endSequence()
	writer.endSequence() // end children

	writer.endSequence() // end the element
}

/** Starts a qualified element of the kind, with its path */
function startQualified(type: Exclude<ElementType, ElementType.Command>, path: RelativeOID, writer: Ber.Writer): void {
	const tags = {
		[ElementType.Function]: QualifiedFunctionBERID,
		[ElementType.Matrix]: QualifiedMatrixBERID,
		[ElementType.Node]: QualifiedNodeBERID,
		[ElementType.Parameter]: QualifiedParameterBERID,
		[ElementType.Template]: QualifiedTemplateBERID,
	}
	writer.startSequence(tags[type])

	writer.startSequence(Ber.CONTEXT(0))
	writer.writeRelativeOID(path, Ber.BERDataTypes.RELATIVE_OID)
	writer.endSequence()
}
