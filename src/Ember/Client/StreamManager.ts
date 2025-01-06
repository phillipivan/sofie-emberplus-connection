import { EventEmitter } from 'eventemitter3'
import { Parameter, ParameterType } from '../../model/Parameter'
import { EmberValue } from '../../types'
import { Collection } from '../../types/types'
import { StreamEntry } from '../../model'

export type StreamManagerEvents = {
	streamUpdate: [path: string, value: EmberValue]
}

interface StreamInfo {
	parameter: Parameter
	path: string
	streamIdentifier: number
	offset: number
}

export class StreamManager extends EventEmitter<StreamManagerEvents> {
	private registeredStreams: Map<string, StreamInfo> = new Map()

	constructor() {
		super()
	}

	public registerParameter(parameter: Parameter, path: string): void {
		if (!parameter.streamIdentifier) {
			return
		}

		const offset = parameter.streamDescriptor?.offset || 0

		const streamInfo: StreamInfo = {
			parameter,
			path,
			streamIdentifier: parameter.streamIdentifier,
			offset: offset,
		}

		// Store both mappings
		this.registeredStreams.set(path, streamInfo)

		console.log('Registered stream:', {
			path: path,
			identifier: parameter.identifier,
			offset: offset,
		})
	}

	public unregisterParameter(path: string): void {
		const streamInfo = this.registeredStreams.get(path)
		if (streamInfo && streamInfo.parameter.streamIdentifier) {
			this.registeredStreams.delete(path)
			console.log('Unregistered stream:', {
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

	public updateAllStreamValues(streamEntries: Collection<StreamEntry>): void {
		Object.values<StreamEntry>(streamEntries).forEach((streamEntry) => {
			this.registeredStreams.forEach((streamInfo, path) => {
				// Only process if IDs match
				if (streamInfo.streamIdentifier === streamEntry.identifier) {
					if (streamEntry.value) {
						const value = streamEntry.value

						if (value.type === ParameterType.Integer) {
							// Handle direct integer values
							this.updateStreamValue(path, value.value)
						} else if (value.type === ParameterType.Octets && Buffer.isBuffer(value.value)) {
							// Handle existing float32 buffer case
							const buffer = value.value
							if (buffer.length >= streamInfo.offset + 4) {
								// Float32 is 4 bytes
								const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.length)
								// decode as little-endian
								const decodedValue = view.getFloat32(streamInfo.offset, true)

								this.updateStreamValue(path, decodedValue)
							}
						}
					}
				}
			})
		})
	}

	public updateStreamValue(path: string, value: EmberValue): void {
		if (path) {
			const streamInfo = this.registeredStreams.get(path)
			if (streamInfo) {
				streamInfo.parameter.value = value
				this.emit('streamUpdate', path, value)
			}
		}
	}

	public getAllRegisteredPaths(): string[] {
		return Array.from(this.registeredStreams.keys())
	}

	// Debug helper
	public printStreamState(): void {
		console.log('\nCurrent Stream State:')
		console.log('Registered Streams:')
		this.registeredStreams.forEach((info, path) => {
			console.log(`  Path: ${path}`)
			console.log(`    Identifier: ${info.parameter.identifier}`)
			console.log(`    StreamId: ${info.parameter.streamIdentifier}`)
			console.log(`    Current Value: ${info.parameter.value}`)
		})
	}
}
