import { EventEmitter } from 'eventemitter3'

import { makeDebug } from '../../lib/debug.js'
import { StreamEntry } from '../../model/index.js'
import { isValueOfType, Parameter, ParameterType } from '../../model/Parameter.js'
import { StreamFormat } from '../../model/StreamDescription.js'
import { EmberValue } from '../../types/index.js'

const debug = makeDebug('StreamManager')

export type StreamManagerEvents = {
	streamUpdate: [path: string, value: EmberValue]
}

interface StreamInfo {
	parameter: Parameter
	path: string
	streamIdentifier: number
}

/**
 * How a value of each stream format is read from a stream entry's octets: its size in bytes, and the read itself.
 * 64-bit integers come out as numbers, like every other Ember+ integer here, so they are exact up to 2^53.
 */
const STREAM_FORMATS: Record<StreamFormat, { size: number; read: (octets: Buffer, offset: number) => number }> = {
	[StreamFormat.UInt8]: { size: 1, read: (octets, offset) => octets.readUInt8(offset) },
	[StreamFormat.UInt16BE]: { size: 2, read: (octets, offset) => octets.readUInt16BE(offset) },
	[StreamFormat.UInt16LE]: { size: 2, read: (octets, offset) => octets.readUInt16LE(offset) },
	[StreamFormat.UInt32BE]: { size: 4, read: (octets, offset) => octets.readUInt32BE(offset) },
	[StreamFormat.UInt32LE]: { size: 4, read: (octets, offset) => octets.readUInt32LE(offset) },
	[StreamFormat.UInt64BE]: { size: 8, read: (octets, offset) => Number(octets.readBigUInt64BE(offset)) },
	[StreamFormat.UInt64LE]: { size: 8, read: (octets, offset) => Number(octets.readBigUInt64LE(offset)) },
	[StreamFormat.Int8]: { size: 1, read: (octets, offset) => octets.readInt8(offset) },
	[StreamFormat.Int16BE]: { size: 2, read: (octets, offset) => octets.readInt16BE(offset) },
	[StreamFormat.Int16LE]: { size: 2, read: (octets, offset) => octets.readInt16LE(offset) },
	[StreamFormat.Int32BE]: { size: 4, read: (octets, offset) => octets.readInt32BE(offset) },
	[StreamFormat.Int32LE]: { size: 4, read: (octets, offset) => octets.readInt32LE(offset) },
	[StreamFormat.Int64BE]: { size: 8, read: (octets, offset) => Number(octets.readBigInt64BE(offset)) },
	[StreamFormat.Int64LE]: { size: 8, read: (octets, offset) => Number(octets.readBigInt64LE(offset)) },
	[StreamFormat.Float32BE]: { size: 4, read: (octets, offset) => octets.readFloatBE(offset) },
	[StreamFormat.Float32LE]: { size: 4, read: (octets, offset) => octets.readFloatLE(offset) },
	[StreamFormat.Float64BE]: { size: 8, read: (octets, offset) => octets.readDoubleBE(offset) },
	[StreamFormat.Float64LE]: { size: 8, read: (octets, offset) => octets.readDoubleLE(offset) },
}

export class StreamManager extends EventEmitter<StreamManagerEvents> {
	/** Maps path -> StreamInfo  */
	private registeredStreams: Map<string, StreamInfo> = new Map()

	/** Maps streamIdentifier -> Set<path> */
	private streamsByIdentifier: Map<number, Set<string>> = new Map() // Lookup by identifier for O(1) access

	constructor() {
		super()
	}

	public registerParameter(parameter: Parameter, path: string): void {
		// 0 is a valid stream identifier: only negative ones aren't
		if (parameter.streamIdentifier === undefined) {
			debug('Warning: Attempted to register parameter without streamIdentifier')
			return
		}
		// Check if already registered
		if (this.registeredStreams.has(path)) {
			debug('Stream already registered:', {
				path,
				identifier: parameter.streamIdentifier,
			})
			return
		}

		const streamInfo: StreamInfo = {
			parameter,
			path,
			streamIdentifier: parameter.streamIdentifier,
		}

		// Store both mappings
		this.registeredStreams.set(path, streamInfo)

		// Add to identifier lookup
		if (!this.streamsByIdentifier.has(parameter.streamIdentifier)) {
			this.streamsByIdentifier.set(parameter.streamIdentifier, new Set())
			debug('Registered new stream identifier and adding set:', parameter.streamIdentifier)
		}
		this.streamsByIdentifier.get(parameter.streamIdentifier)?.add(path)

		debug('Registered new stream:', {
			path,
			identifier: parameter.streamIdentifier,
			totalRegistered: this.registeredStreams.size,
		})
	}

	public unregisterParameter(path: string): void {
		const streamInfo = this.registeredStreams.get(path)
		if (streamInfo) {
			// Clean up both maps
			this.registeredStreams.delete(path)
			const paths = this.streamsByIdentifier.get(streamInfo.streamIdentifier)
			if (paths) {
				paths.delete(path)
				if (paths.size === 0) {
					this.streamsByIdentifier.delete(streamInfo.streamIdentifier)
				}
			}

			debug('Unregistered stream:', {
				path: path,
				identifier: streamInfo.parameter.identifier,
			})
		}
	}

	public getStreamInfoByPath(path: string): StreamInfo | undefined {
		return this.registeredStreams.get(path)
	}

	public hasStream(identifier: string): boolean {
		return this.registeredStreams.has(identifier)
	}

	public updateStreamValues(streamEntries: Array<StreamEntry>): void {
		streamEntries.forEach((streamEntry) => {
			// O(1) lookup by identifier
			const paths = this.streamsByIdentifier.get(streamEntry.identifier)

			if (!paths) {
				debug('Received update for unregistered stream:', streamEntry.identifier)
				return
			}

			// Process each matching stream
			paths.forEach((path) => {
				const streamInfo = this.registeredStreams.get(path)
				if (!streamInfo || !streamEntry.value) return

				if (streamEntry.value.type === ParameterType.Integer || streamEntry.value.type === ParameterType.Real) {
					// a numeric value is the parameter's value as it is
					this.updateStreamValue(path, streamEntry.value.value)
				} else if (
					streamEntry.value.type === ParameterType.Octets &&
					Buffer.isBuffer(streamEntry.value.value)
				) {
					const octets = streamEntry.value.value
					// The parameter's stream descriptor says where its value is in the octets, and in which format.
					// Several parameters can share a stream, each with its own descriptor.
					const descriptor = streamInfo.parameter.streamDescriptor
					if (!descriptor) {
						// nothing says what the octets hold, so they are the value
						this.updateStreamValue(path, octets)
						return
					}
					const { size, read } = STREAM_FORMATS[descriptor.format]
					if (descriptor.offset < 0 || descriptor.offset + size > octets.length) {
						debug('Stream value outside the octets received:', {
							path,
							descriptor,
							length: octets.length,
						})
						return
					}
					this.updateStreamValue(path, read(octets, descriptor.offset))
				} // Note: other types aren't handled. A stream parameter's "type must not be a string or Boolean".
			})
		})
	}

	private updateStreamValue(path: string, value: EmberValue): void {
		if (path) {
			const streamInfo = this.registeredStreams.get(path)
			if (streamInfo) {
				// Stored only when it fits the parameter's type (raw octets, with no descriptor to read them by, don't fit
				// a numeric parameter); passed on either way
				if (isValueOfType(streamInfo.parameter.parameterType, value)) {
					streamInfo.parameter.value = value
				} else {
					debug('Stream value does not fit the parameter type, not stored:', { path, value })
				}
				this.emit('streamUpdate', path, value)
			}
		}
	}

	public getAllRegisteredPaths(): string[] {
		return Array.from(this.registeredStreams.keys())
	}

	// Debug helper
	public printStreamState(): void {
		debug('\nCurrent Stream State:')
		debug('Registered Streams:')
		this.registeredStreams.forEach((info, path) => {
			debug(`  Path: ${path}`)
			debug(`    Identifier: ${info.parameter.identifier}`)
			debug(`    StreamId: ${info.parameter.streamIdentifier}`)
			debug(`    Current Value: ${info.parameter.value}`)
		})
	}
}
