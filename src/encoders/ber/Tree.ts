import { EmberTreeNode } from '../../types/types'
import * as Ber from '../../Ber'
import { ElementType, EmberElement } from '../../model/EmberElement'
import { encodeEmberElement } from './EmberElement'
import { encodeCommand } from './Command'
import { Command } from '../../model/Command'
import { encodeTemplate } from './Template'
import { Template } from '../../model/Template'
import { Matrix } from '../../model/Matrix'
import { encodeConnection } from './Connection'
import { encodeTarget, encodeSource } from './Matrix'

export function encodeTree(el: EmberTreeNode<EmberElement>, writer: Ber.Writer, isQualified = false) {
	if (el.value.type === ElementType.Command) {
		// Command is a special case
		if (isQualified) throw new Error('Command cannot be qualified')

		encodeCommand(el.value as Command, writer)
		return
	}

	if (!isQualified) {
		switch (el.value.type) {
			case ElementType.Function:
				writer.startSequence(Ber.APPLICATION(19))
				break
			case ElementType.Matrix:
				writer.startSequence(Ber.APPLICATION(13))
				break
			case ElementType.Node:
				writer.startSequence(Ber.APPLICATION(3)) // start Node
				break
			case ElementType.Parameter:
				writer.startSequence(Ber.APPLICATION(1))
				break
			case ElementType.Template:
				writer.startSequence(Ber.APPLICATION(24))
				break
		}

		writer.startSequence(Ber.CONTEXT(0)) // start number
		writer.writeInt(el.value.number, Ber.BERDataTypes.INTEGER)
		writer.endSequence()
	}

	// Encode Contents:
	encodeEmberElement(el.value, writer)

	if (hasChildren(el)) {
		writer.startSequence(Ber.CONTEXT(2)) // start children
		writer.startSequence(Ber.APPLICATION(4)) // start ElementCollection
		writer.startSequence(Ber.BERDataTypes.SEQUENCE) // start Sequence
		for (const child of el.children!) {
			writer.startSequence(Ber.CONTEXT(0)) // start child
			encodeTree(child, writer)
			writer.endSequence() // end child
		}
		writer.endSequence() // end sequence
		writer.endSequence() // end ElementCollection
		writer.endSequence() // end children
	}

	// Matrix contains some other props as well
	if (isMatrix(el.value)) {
		// encode targets
		if (el.value.targets) {
			writer.startSequence(Ber.CONTEXT(3)) // start targets
			writer.startSequence(Ber.BERDataTypes.SEQUENCE) // start sequence
			// write target collection
			for (const target of el.value.targets) {
				writer.startSequence(Ber.CONTEXT(0)) // start child
				encodeTarget(target, writer)
				writer.endSequence() // end child
			}
			writer.endSequence() // end sequence
			writer.endSequence() // end children
		}
		if (el.value.sources) {
			writer.startSequence(Ber.CONTEXT(4))
			writer.startSequence(Ber.BERDataTypes.SEQUENCE)
			// write sources collection
			for (const source of el.value.sources) {
				writer.startSequence(Ber.CONTEXT(0))
				encodeSource(source, writer)
				writer.endSequence()
			}
			writer.endSequence()
			writer.endSequence()
		}
		if (el.value.connections) {
			writer.startSequence(Ber.CONTEXT(5))
			writer.startSequence(Ber.BERDataTypes.SEQUENCE)
			// write connections collection
			for (const connection of el.value.connections) {
				writer.startSequence(Ber.CONTEXT(0))
				encodeConnection(connection, writer)
				writer.endSequence()
			}
			writer.endSequence()
			writer.endSequence()
		}
	} else if (el.value.type === ElementType.Template) {
		encodeTemplate(el.value as Template, writer)
	}

	writer.endSequence() // end node
}

function hasChildren(el: EmberTreeNode<EmberElement>): boolean {
	return (
		'children' in el &&
		!(
			el.value.type === ElementType.Command ||
			el.value.type === ElementType.Parameter ||
			el.value.type === ElementType.Template
		)
	)
}

function isMatrix(el: EmberElement): el is Matrix {
	return el.type === ElementType.Matrix
}
