import { Root, RootType, RootElement } from '../../types/types'
import * as Ber from '../../Ber'
import { encodeInvocationResult } from './encoder/InvocationResult'
import { InvocationResult } from '../../model/InvocationResult'
import { encodeRootElement } from './encoder/RootElement'
import { StreamEntry } from '../../model/StreamEntry'
import { encodeStreamEntry } from './encoder/StreamEntry'
import { decodeInvocationResult } from './decoder/InvocationResult'
import { decodeRootElements } from './decoder/Tree'
import { decodeStreamEntries } from './decoder/StreamEntry'

export { berEncode, berDecode }

function berEncode(el: Root, rootType: RootType): Buffer {
	const writer = new Ber.Writer()
	writer.startSequence(Ber.APPLICATION(0)) // Start ROOT

	switch (rootType) {
		case RootType.Elements:
			writer.startSequence(Ber.APPLICATION(11)) // Start RootElementCollection
			writer.startSequence(Ber.BERDataTypes.SEQUENCE)
			for (const rootEl of el as RootElement[]) {
				writer.startSequence(Ber.CONTEXT(0))
				encodeRootElement(rootEl, writer)
				writer.endSequence()
			}
			writer.endSequence()
			writer.endSequence() // End RootElementCollection
			break
		case RootType.Streams:
			writer.startSequence(Ber.APPLICATION(6)) // Start StreamCollection
			writer.startSequence(Ber.BERDataTypes.SEQUENCE)
			for (const entry of el as StreamEntry[]) {
				writer.startSequence(Ber.CONTEXT(0))
				encodeStreamEntry(entry, writer)
				writer.endSequence()
			}
			writer.endSequence()
			writer.endSequence() // End StreamCollection
			break
		case RootType.InvocationResult:
			encodeInvocationResult(el as InvocationResult, writer)
			break
	}

	writer.endSequence() // End ROOT
	return writer.buffer
}

function berDecode(b: Buffer): Root {
	const reader = new Ber.Reader(b)

	const tag = reader.peek()

	if (tag !== Ber.APPLICATION(0)) throw new Error('Buffer does not contain a root') // TODO - may be continuation from previous msg

	const rootSeq = reader.getSequence(tag)
	const rootSeqType = rootSeq.peek()

	if (rootSeqType === Ber.APPLICATION(11)) {
		// RootElementCollection
		const root: Array<RootElement> = decodeRootElements(rootSeq)
		return root
	} else if (rootSeqType === Ber.APPLICATION(6)) {
		// StreamCollection
		const root: Array<StreamEntry> = decodeStreamEntries(rootSeq)
		return root
	} else if (rootSeqType === Ber.APPLICATION(23)) {
		// InvocationResult
		const root: InvocationResult = decodeInvocationResult(rootSeq)
		return root
	}

	throw new Error('No valid root element')
}
