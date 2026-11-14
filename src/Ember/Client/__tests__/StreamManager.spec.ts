import { ParameterImpl, ParameterType } from '../../../model/Parameter.js'
import { StreamDescription } from '../../../model/StreamDescription.js'
import { StreamEntryImpl } from '../../../model/StreamEntry.js'
import { EmberTypedValue, EmberValue } from '../../../types/types.js'
import { StreamManager } from '../StreamManager.js'

// A parameter that reports its value in the stream `streamIdentifier`
function streamParameter(type: ParameterType, streamIdentifier: number, streamDescriptor?: StreamDescription) {
	const parameter = new ParameterImpl(type, 'meter')
	parameter.streamIdentifier = streamIdentifier
	parameter.streamDescriptor = streamDescriptor
	return parameter
}

// A StreamManager with the parameter registered at the path 1.1, and the values it reports for that path
function register(parameter: ParameterImpl) {
	const manager = new StreamManager()
	const updates: EmberValue[] = []
	manager.on('streamUpdate', (_path, value) => updates.push(value))
	manager.registerParameter(parameter, '1.1')
	return { manager, updates }
}

const integer = (value: number): EmberTypedValue => ({ type: ParameterType.Integer, value })

describe('StreamManager', () => {
	// Ember+ specification, StreamIdentifier: "a globally unique identifier which must not be negative"
	describe('stream identifier 0', () => {
		it('reports the values of a parameter in stream 0', () => {
			const parameter = streamParameter(ParameterType.Integer, 0)
			const { manager, updates } = register(parameter)

			manager.updateStreamValues([new StreamEntryImpl(0, integer(7))])

			expect(updates).toEqual([7])
			expect(parameter.value).toBe(7)
		})

		it('stops reporting them once the parameter is unregistered', () => {
			const { manager, updates } = register(streamParameter(ParameterType.Integer, 0))

			manager.unregisterParameter('1.1')
			manager.updateStreamValues([new StreamEntryImpl(0, integer(7))])

			expect(updates).toEqual([])
			expect(manager.getAllRegisteredPaths()).toEqual([])
		})
	})
})
