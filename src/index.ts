import { ConnectionStatus } from './Ember/Client/ConnectionStatus.js'
import {
	ContentsProperty,
	EmberClient,
	EmberClientEvents,
	EmberClientOptions,
	RequestPromise,
	RequestPromiseArguments,
	TreeChange,
	TreeChangeAdded,
	TreeChangeKind,
	TreeChangeOutsideTree,
	TreeChangeUpdated,
} from './Ember/Client/index.js'
import { EmberLib } from './Ember/Lib/index.js'
import { EmberServer, EmberServerEvents, EmberServerOptions } from './Ember/Server/index.js'
import { S101Client } from './Ember/Socket/index.js'
import S101Socket, { S101SocketEvents } from './Ember/Socket/S101Socket.js'
import { DecodeOptions, DecodeResult } from './encodings/ber/decoder/DecodeResult.js'
// import { EmberTreeNode, TreeElement } from './types/types'
import { berDecode, berEncode, DecodedRoot, EncodableRoot } from './encodings/ber/index.js'
import { DebugLog, setDebugLogging } from './lib/debug.js'
import * as Model from './model/index.js'
import { S101Codec } from './S101/index.js'
import { S101CodecEvents } from './S101/S101Codec.js'
// import { EmberElement } from './model/EmberElement'

// import {
// 	EmberTreeNode,
// 	EmberValue,
// 	EmberTypedValue,
// 	Root,
// 	RootElement,
// 	MinMax,
// 	StringIntegerCollection,
// 	RootType,
// 	RelativeOID,
// }
import * as Types from './types/types.js'

const Decoder = EmberLib.DecodeBuffer

// TODO
// function isValid(_el: EmberTreeNode<EmberElement>): boolean {
// 	return false
// }

// TODO
// function toJSON(_el: TreeElement<EmberElement>): Record<string, any> {
// 	return null
// }

// TODO
// function fromJSON(json: Record<string, any>): TreeElement<EmberElement> {
// 	return null
// }

// The types the public classes and functions take, return and emit are exported with them
export {
	EmberClient,
	EmberClientEvents,
	EmberClientOptions,
	RequestPromise,
	RequestPromiseArguments,
	TreeChange,
	TreeChangeAdded,
	TreeChangeKind,
	TreeChangeOutsideTree,
	TreeChangeUpdated,
	ContentsProperty,
	ConnectionStatus,
	Decoder,
	EmberLib,
	EmberServer,
	EmberServerEvents,
	EmberServerOptions,
	S101Codec,
	S101CodecEvents,
	S101Client,
	S101Socket,
	S101SocketEvents,
	berEncode,
	EncodableRoot,
	berDecode,
	DecodedRoot,
	DecodeResult,
	DecodeOptions,
	// isValid,
	// toJSON,
	// fromJSON,
	Types,
	Model,
	setDebugLogging,
	DebugLog,
}
