import { EmberClient } from './Ember/Client/index'
import { EmberLib } from './Ember/Lib/index'
import { EmberServer, ServerEvents } from './Ember/Server/index'
import { S101 } from './S101/index'
import { S101Client } from './Ember/Socket/index'
import { EmberTreeNode } from './types/types'
import * as Ber from './Ber'

const Decoder = EmberLib.DecodeBuffer

function berEncode(el: EmberTreeNode): Buffer {
	const writer = new Ber.Writer()
	writer.startSequence(Ber.APPLICATION(0))
	if (el.children) {
		writer.startSequence(Ber.APPLICATION(11))
		el.children.forEach((child) => writeToBer(child, writer)) // TODO - iterate over tree and call the correct functions
		writer.endSequence()
	}
	writer.endSequence()
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
