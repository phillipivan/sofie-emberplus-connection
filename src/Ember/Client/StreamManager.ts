import { Parameter } from '../../model/Parameter'
import { StreamDescription } from '../../model/StreamDescription'
import { EmberValue } from '../../types'
import { EventEmitter } from 'eventemitter3'

export type StreamManagerEvents = {
	streamUpdate: [streamId: number, value: EmberValue]
}

export class StreamManager extends EventEmitter<StreamManagerEvents> {
	private static instance: StreamManager
	private registeredParameters: Map<number, Parameter> = new Map()
	private streamDescriptors: Map<number, StreamDescription> = new Map()

	private constructor() {
		super()
	}

	public static getInstance(): StreamManager {
		if (!StreamManager.instance) {
			StreamManager.instance = new StreamManager()
		}
		return StreamManager.instance
	}

	public registerParameter(parameter: Parameter): void {
		if (!parameter.streamIdentifier) {
			return
		}

		this.registeredParameters.set(parameter.streamIdentifier, parameter)

		if (parameter.streamDescriptor) {
			this.streamDescriptors.set(parameter.streamIdentifier, parameter.streamDescriptor)
		}
	}

	public unregisterParameter(parameter: Parameter): void {
		if (!parameter.streamIdentifier) {
			return
		}

		this.registeredParameters.delete(parameter.streamIdentifier)
		this.streamDescriptors.delete(parameter.streamIdentifier)
	}

	public getStreamDescriptor(streamId: number): StreamDescription | undefined {
		return this.streamDescriptors.get(streamId)
	}

	public getParameter(streamId: number): Parameter | undefined {
		return this.registeredParameters.get(streamId)
	}

	public hasStream(streamId: number): boolean {
		return this.registeredParameters.has(streamId)
	}

	public updateStreamValue(streamId: number, value: EmberValue): void {
		const parameter = this.registeredParameters.get(streamId)
		if (parameter) {
			parameter.value = value
			this.emit('streamUpdate', streamId, value)
		}
	}
}
