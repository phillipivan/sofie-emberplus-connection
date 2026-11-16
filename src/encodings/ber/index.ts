import * as Ber from '../../Ber/index.js'
import { EmberNodeImpl } from '../../model/EmberNode.js'
import { InvocationResult } from '../../model/InvocationResult.js'
import { StreamEntry } from '../../model/StreamEntry.js'
import { NumberedTreeNodeImpl } from '../../model/Tree.js'
import { Collection, RootElement, RootType } from '../../types/types.js'
import { InvocationResultBERID, RootBERID, RootElementsBERID, StreamEntriesBERID } from './constants.js'
import { DecodeOptions, DecodeResult, defaultDecode, makeResult, unknownApplication } from './decoder/DecodeResult.js'
import { decodeInvocationResult } from './decoder/InvocationResult.js'
import { decodeStreamEntries } from './decoder/StreamEntry.js'
import { decodeRootElements } from './decoder/Tree.js'
import { encodeInvocationResult } from './encoder/InvocationResult.js'
import { encodeRootElement } from './encoder/RootElement.js'
import { encodeStreamEntry } from './encoder/StreamEntry.js'

export { berEncode, berDecode, DecodedRoot, EncodableRoot }

/** What berEncode takes: a root, with the RootType of that kind of root (so a caller can pass one on as it is) */
type EncodableRoot =
	| [el: Collection<RootElement>, rootType: RootType.Elements]
	| [el: Collection<StreamEntry>, rootType: RootType.Streams]
	| [el: InvocationResult, rootType: RootType.InvocationResult]

/**
 * What berDecode gives: the decoded root and the errors found (a DecodeResult), with the RootType of the kind of root
 * it is, to tell them apart by.
 */
type DecodedRoot =
	| (DecodeResult<Collection<RootElement>> & { rootType: RootType.Elements })
	| (DecodeResult<Collection<StreamEntry>> & { rootType: RootType.Streams })
	| (DecodeResult<InvocationResult> & { rootType: RootType.InvocationResult })

/** Encodes a root: elements, a stream collection or an invocation result, with the RootType of that kind of root */
function berEncode(...[el, rootType]: EncodableRoot): Buffer {
	const writer = new Ber.Writer()
	writer.startSequence(RootBERID) // Start ROOT

	switch (rootType) {
		case RootType.Elements:
			writer.startSequence(RootElementsBERID) // Start RootElementCollection
			for (const rootEl of Object.values<RootElement>(el)) {
				writer.startSequence(Ber.CONTEXT(0))
				encodeRootElement(rootEl, writer)
				writer.endSequence()
			}
			writer.endSequence() // End RootElementCollection
			break
		case RootType.Streams:
			writer.startSequence(StreamEntriesBERID) // Start StreamCollection
			for (const entry of Object.values<StreamEntry>(el)) {
				writer.startSequence(Ber.CONTEXT(0))
				encodeStreamEntry(entry, writer)
				writer.endSequence()
			}
			writer.endSequence() // End StreamCollection
			break
		case RootType.InvocationResult:
			encodeInvocationResult(el, writer)
			break
	}

	writer.endSequence() // End ROOT
	return writer.buffer
}

function berDecode(b: Buffer, options: DecodeOptions = defaultDecode): DecodedRoot {
	const reader = new Ber.Reader(b)
	const errors = new Array<Error>()

	const tag = reader.peek()

	if (tag !== RootBERID) {
		unknownApplication(errors, 'decode root', tag, options)
		return {
			...makeResult([new NumberedTreeNodeImpl(-1, new EmberNodeImpl())], errors),
			rootType: RootType.Elements,
		}
	}

	reader.readSequence(tag !== null ? tag : undefined)
	const rootSeqType = reader.peek()

	if (rootSeqType === RootElementsBERID) {
		return { ...decodeRootElements(reader, options), rootType: RootType.Elements }
	} else if (rootSeqType === StreamEntriesBERID) {
		return { ...decodeStreamEntries(reader, options), rootType: RootType.Streams }
	} else if (rootSeqType === InvocationResultBERID) {
		return { ...decodeInvocationResult(reader, options), rootType: RootType.InvocationResult }
	}

	unknownApplication(errors, 'decode root', rootSeqType, options)
	return { ...makeResult([new NumberedTreeNodeImpl(-1, new EmberNodeImpl())], errors), rootType: RootType.Elements }
}
