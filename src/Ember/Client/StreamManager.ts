import { EventEmitter } from 'eventemitter3'
import { Parameter, ParameterType } from '../../model/Parameter'
import { EmberValue } from '../../types'
import { StreamEntry } from '../../model'

import Debug from 'debug'

const debug = Debug('emberplus-connection:StreamManager')

// Rate limit for stream updates in ms
// Currently hardcoded to 200ms
const RATE_LIMIT_MS = 200

export type StreamManagerEvents = {
	streamUpdate: [path: string, value: EmberValue]
}

interface StreamInfo {
	parameter: Parameter
	path: string
	streamIdentifier: number
	offset: number
	lastUpdate?: number
}

export class StreamManager extends EventEmitter<StreamManagerEvents> {
	private registeredStreams: Map<string, StreamInfo> = new Map()
	// Lookup by identifier for O(1) access
	private streamsByIdentifier: Map<number, Set<string>> = new Map()

	constructor() {
		super()
	}

	public registerParameter(parameter: Parameter, path: string): void {
		if (!parameter.streamIdentifier) {
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
			offset: parameter.streamDescriptor?.offset || 0,
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
		if (streamInfo?.streamIdentifier) {
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

	public updateStreamValues(streamEntries: StreamEntry[]): void {
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

				// Check rate limit
				const now = Date.now()
				if (streamInfo.lastUpdate && now - streamInfo.lastUpdate < RATE_LIMIT_MS) {
					return // Skip update if within rate limit window
				}
				streamInfo.lastUpdate = now

				if (streamEntry.value.type === ParameterType.Integer) {
					this.updateStreamValue(path, streamEntry.value.value, streamInfo)
				} else if (streamEntry.value.type === ParameterType.Octets && Buffer.isBuffer(streamEntry.value.value)) {
					const buffer = streamEntry.value.value
					if (buffer.length >= streamInfo.offset + 4) {
						const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.length)
						const decodedValue = view.getFloat32(streamInfo.offset, true)
						this.updateStreamValue(path, decodedValue, streamInfo)
					}
				} else {
					debug('Unhandled stream value type:', streamEntry.value.type)
				}
			})
		})
	}

	public updateStreamValue(path: string, value: EmberValue, streamInfo: StreamInfo): void {
		streamInfo.parameter.value = value
		this.emit('streamUpdate', path, value)
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
