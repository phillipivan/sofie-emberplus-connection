import * as Ber from '../../Ber'
import { Node, NodeImpl } from '../../model/Node'
import { decodeChildren } from './Tree'
import { EmberTreeNode } from '../../types/types'
import { TreeImpl } from '../../model/Tree'
import { EmberElement } from '../../model/EmberElement'

const NodeBERID = Ber.APPLICATION(3)

export function decodeNode(reader: Ber.Reader): EmberTreeNode<Node> {
	const ber = reader.getSequence(NodeBERID)
	let number: number | null = null
	let contents: Node | null = null
	let kids: Array<EmberTreeNode<EmberElement>> | undefined = undefined
	while (ber.remain > 0) {
		const tag = ber.peek()
		const seq = ber.getSequence(tag!)
		switch (tag) {
			case Ber.CONTEXT(0):
				number = seq.readInt()
			  break
			case Ber.CONTEXT(1):
				contents = decodeNodeContents(seq)
			  break
			case Ber.CONTEXT(2):
				kids = decodeChildren(seq)
				break
			default:
				throw new Error(``)
		}
	}
	if (number === null) {
		throw new Error(``)
	}
	if (contents === null) {
		return new TreeImpl(
			new NodeImpl(number),
			undefined,
			kids)
	}
	return new TreeImpl(new NodeImpl(
			number,
			contents.identifier,
			contents.description,
			contents.isRoot,
			contents.isOnline,
			contents.schemaIdentifiers,
			contents.templateReference
		),
		undefined,
		kids)
}

function decodeNodeContents(reader: Ber.Reader): Node {
	let n: Node = {} as Node
	const ber = reader.getSequence(Ber.BERDataTypes.SET)
	while (ber.remain > 0) {
		const tag = ber.peek()
		const seq = ber.getSequence(tag!)
		switch (tag) {
			case Ber.CONTEXT(0):
				n.identifier = seq.readString(Ber.BERDataTypes.STRING)
			  break
			case Ber.CONTEXT(1):
				n.description = seq.readString(Ber.BERDataTypes.STRING)
			  break
			case Ber.CONTEXT(2):
				n.isRoot = seq.readBoolean()
			  break
			case Ber.CONTEXT(3):
				n.isOnline = seq.readBoolean()
			  break
			case Ber.CONTEXT(4):
				n.schemaIdentifiers = seq.readString(Ber.BERDataTypes.STRING)
			  break
			default:
				throw new Error(``)
		}
	}
	return n
}
