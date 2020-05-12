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
import { DecodeResult, DecodeOptions, defaultDecode } from './decoder/DecodeResult'
import {
	RootBERID,
	RootElementsBERID,
	StreamEntriesBERID,
	InvocationResultBERID
} from './constants'

export { berEncode, berDecode }

function berEncode(el: Root, rootType: RootType): Buffer {
	const writer = new Ber.Writer()
	writer.startSequence(RootBERID) // Start ROOT

	switch (rootType) {
		case RootType.Elements:
			writer.startSequence(RootElementsBERID) // Start RootElementCollection
			for (const rootEl of el as RootElement[]) {
				writer.startSequence(Ber.CONTEXT(0))
				encodeRootElement(rootEl, writer)
				writer.endSequence()
			}
			writer.endSequence() // End RootElementCollection
			break
		case RootType.Streams:
			writer.startSequence(StreamEntriesBERID) // Start StreamCollection
			for (const entry of el as StreamEntry[]) {
				writer.startSequence(Ber.CONTEXT(0))
				encodeStreamEntry(entry, writer)
				writer.endSequence()
			}
			writer.endSequence() // End StreamCollection
			break
		case RootType.InvocationResult:
			encodeInvocationResult(el as InvocationResult, writer)
			break
	}

	writer.endSequence() // End ROOT
	return writer.buffer
}

function berDecode(b: Buffer, options: DecodeOptions = defaultDecode): DecodeResult<Root> {
	const reader = new Ber.Reader(b)

	const tag = reader.peek()

	// TODO deal with top-level errors
	if (tag !== RootBERID) throw new Error('Buffer does not contain a root') // TODO - may be continuation from previous msg

	const rootSeq = reader.getSequence(tag)
	const rootSeqType = rootSeq.peek()

	if (rootSeqType === RootElementsBERID) {
		// RootElementCollection
		const root: DecodeResult<Array<RootElement>> = decodeRootElements(rootSeq, options)
		return root
	} else if (rootSeqType === StreamEntriesBERID) {
		// StreamCollection
		const root: DecodeResult<Array<StreamEntry>> = decodeStreamEntries(rootSeq, options)
		return root
	} else if (rootSeqType === InvocationResultBERID) {
		// InvocationResult
		const root: DecodeResult<InvocationResult> = decodeInvocationResult(rootSeq, options)
		return root
	}

	throw new Error('No valid root element')
}
