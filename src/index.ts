import { EmberClient } from './Ember/Client/index'
import { EmberLib } from './Ember/Lib/index'
import { EmberServer, ServerEvents } from './Ember/Server/index'
import { S101 } from './S101/index'
import { S101Client } from './Ember/Socket/index'
import { EmberTreeNode, Root, RootType, RootElement } from './types/types'
import * as Ber from './Ber'
import { encodeInvocationResult } from './encoders/ber/InvocationResult'
import { InvocationResult } from './model/InvocationResult'
import { encodeRootElement } from './encoders/ber/RootElement'
import { StreamEntry } from './model/StreamEntry'
import { encodeStreamEntry } from './encoders/ber/StreamEntry'

const Decoder = EmberLib.DecodeBuffer

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

function berDecode(b: Buffer): EmberTreeNode {
	return null
}

function isValid(el: EmberTreeNode): boolean {
	return false
}

function toJSON(el: EmberTreeNode): Object {
	return null
}

function fromJSON(json: Object): EmberTreeNode {
	return null
}

export {
	EmberClient,
	Decoder,
	EmberLib,
	EmberServer,
	ServerEvents,
	S101,
	S101Client,
	berEncode,
	berDecode,
	isValid,
	toJSON,
	fromJSON
}
