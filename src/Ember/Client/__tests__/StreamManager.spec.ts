import { berDecode, berEncode } from '../../../encodings/ber/index.js'
import { ElementType } from '../../../model/EmberElement.js'
import { Parameter, ParameterType } from '../../../model/Parameter.js'
import { StreamDescription, StreamDescriptionImpl, StreamFormat } from '../../../model/StreamDescription.js'
import { StreamEntry, StreamEntryImpl } from '../../../model/StreamEntry.js'
import { Collection, EmberTypedValue, EmberValue, RootType } from '../../../types/types.js'
import { StreamManager } from '../StreamManager.js'

// A parameter that reports its value in the stream `streamIdentifier`
function streamParameter(
	type: ParameterType,
	streamIdentifier: number,
	streamDescriptor?: StreamDescription
): Parameter {
	// No value, so a parameter of any type
	return { type: ElementType.Parameter, parameterType: type, identifier: 'meter', streamIdentifier, streamDescriptor }
}

// A StreamManager with the parameter registered at the path 1.1, and the values it reports for that path
function register(parameter: Parameter) {
	const manager = new StreamManager()
	const updates: EmberValue[] = []
	manager.on('streamUpdate', (_path, value) => updates.push(value))
	manager.registerParameter(parameter, '1.1')
	return { manager, updates }
}

const integer = (value: number): EmberTypedValue => ({ type: ParameterType.Integer, value })
const octets = (value: Buffer): EmberTypedValue => ({ type: ParameterType.Octets, value })

// A stream collection as it arrives from a provider: encoded, then decoded
function received(entries: StreamEntry[]): Collection<StreamEntry> {
	return berDecode(berEncode(entries, RootType.Streams)).value as Collection<StreamEntry>
}

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

	// A stream entry's value is any Value. A parameter with a stream identifier is "intended to be used for numeric
	// values only": its type "must not be a string or Boolean".
	describe('numeric values', () => {
		it.each<[string, ParameterType, EmberTypedValue]>([
			['an INTEGER', ParameterType.Integer, { type: ParameterType.Integer, value: -3 }],
			['a REAL', ParameterType.Real, { type: ParameterType.Real, value: -12.5 }],
			['a REAL without a fraction', ParameterType.Real, { type: ParameterType.Real, value: 4 }],
		])('reports %s', (_, parameterType, value) => {
			const parameter = streamParameter(parameterType, 5)
			const { manager, updates } = register(parameter)

			manager.updateStreamValues(received([new StreamEntryImpl(5, value)]))

			expect(updates).toEqual([value.value])
			expect(parameter.value).toBe(value.value)
		})
	})

	// Ember+ specification, StreamDescriptor: it "specifies where the data for a parameter is located within the
	// buffer and how to decode it". The formats are those of the DTD's StreamFormat.
	describe('octets', () => {
		const OFFSET = 3
		const formats: Array<[StreamFormat, number, (buffer: Buffer, value: number) => void]> = [
			[StreamFormat.UInt8, 200, (b, v) => b.writeUInt8(v, OFFSET)],
			[StreamFormat.UInt16BE, 51234, (b, v) => b.writeUInt16BE(v, OFFSET)],
			[StreamFormat.UInt16LE, 51234, (b, v) => b.writeUInt16LE(v, OFFSET)],
			[StreamFormat.UInt32BE, 3123456789, (b, v) => b.writeUInt32BE(v, OFFSET)],
			[StreamFormat.UInt32LE, 3123456789, (b, v) => b.writeUInt32LE(v, OFFSET)],
			[StreamFormat.UInt64BE, 2 ** 40 + 5, (b, v) => b.writeBigUInt64BE(BigInt(v), OFFSET)],
			[StreamFormat.UInt64LE, 2 ** 40 + 5, (b, v) => b.writeBigUInt64LE(BigInt(v), OFFSET)],
			[StreamFormat.Int8, -100, (b, v) => b.writeInt8(v, OFFSET)],
			[StreamFormat.Int16BE, -2050, (b, v) => b.writeInt16BE(v, OFFSET)],
			[StreamFormat.Int16LE, -2050, (b, v) => b.writeInt16LE(v, OFFSET)],
			[StreamFormat.Int32BE, -70000, (b, v) => b.writeInt32BE(v, OFFSET)],
			[StreamFormat.Int32LE, -70000, (b, v) => b.writeInt32LE(v, OFFSET)],
			[StreamFormat.Int64BE, -(2 ** 40) - 5, (b, v) => b.writeBigInt64BE(BigInt(v), OFFSET)],
			[StreamFormat.Int64LE, -(2 ** 40) - 5, (b, v) => b.writeBigInt64LE(BigInt(v), OFFSET)],
			[StreamFormat.Float32BE, -20.5, (b, v) => b.writeFloatBE(v, OFFSET)],
			[StreamFormat.Float32LE, -20.5, (b, v) => b.writeFloatLE(v, OFFSET)],
			[StreamFormat.Float64BE, -20.123456789, (b, v) => b.writeDoubleBE(v, OFFSET)],
			[StreamFormat.Float64LE, -20.123456789, (b, v) => b.writeDoubleLE(v, OFFSET)],
		]

		it('has a case below for every stream format', () => {
			expect(formats.map(([format]) => format).sort()).toEqual(Object.values<StreamFormat>(StreamFormat).sort())
		})

		it.each(formats)('reads a %s value at the offset its descriptor gives', (format, value, write) => {
			const blob = Buffer.alloc(16, 0xaa)
			write(blob, value)
			const parameter = streamParameter(ParameterType.Real, 5, new StreamDescriptionImpl(format, OFFSET))
			const { manager, updates } = register(parameter)

			manager.updateStreamValues(received([new StreamEntryImpl(5, octets(blob))]))

			expect(updates).toEqual([value])
			expect(parameter.value).toBe(value)
		})

		// "This array may contain an arbitrary number of stream-values, for each parameter that has the same
		// StreamIdentifier."
		it('reads each parameter of a stream in its own format, at its own offset', () => {
			const manager = new StreamManager()
			const left = streamParameter(ParameterType.Integer, 5, new StreamDescriptionImpl(StreamFormat.Int16BE, 0))
			const right = streamParameter(ParameterType.Real, 5, new StreamDescriptionImpl(StreamFormat.Float32LE, 2))
			manager.registerParameter(left, '1.1')
			manager.registerParameter(right, '1.2')
			const blob = Buffer.alloc(6)
			blob.writeInt16BE(-300, 0)
			blob.writeFloatLE(-20.5, 2)

			manager.updateStreamValues(received([new StreamEntryImpl(5, octets(blob))]))

			expect([left.value, right.value]).toEqual([-300, -20.5])
		})

		it('reports nothing when the octets end before the value', () => {
			const descriptor = new StreamDescriptionImpl(StreamFormat.Float64LE, 4) // needs bytes 4 to 11
			const { manager, updates } = register(streamParameter(ParameterType.Real, 5, descriptor))

			manager.updateStreamValues(received([new StreamEntryImpl(5, octets(Buffer.alloc(8)))]))

			expect(updates).toEqual([])
		})

		// Without a descriptor there is nothing to say what the octets hold: they are the value
		it('reports the octets themselves for a parameter without a descriptor', () => {
			const parameter = streamParameter(ParameterType.Octets, 5)
			const { manager, updates } = register(parameter)
			const blob = Buffer.from('010203040506', 'hex')

			manager.updateStreamValues(received([new StreamEntryImpl(5, octets(blob))]))

			expect(updates).toEqual([blob])
			expect(parameter.value).toEqual(blob)
		})
	})
})
