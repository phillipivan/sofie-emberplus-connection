import * as Ber from '../../../Ber/index.js'
import { ElementType } from '../../../model/EmberElement.js'
import { Parameter, ParameterAccess, ParameterType, TypedParameter } from '../../../model/Parameter.js'
import { StreamDescriptionImpl, StreamFormat } from '../../../model/StreamDescription.js'
import { literal } from '../../../types/types.js'
import { guarded } from '../decoder/DecodeResult.js'
import { decodeParameter } from '../decoder/Parameter.js'
import { encodeParameter } from '../encoder/Parameter.js'

describe('encodings/ber/Parameter', () => {
	// A parameter's value is tied to its type: each test spreads this base and gives the type
	const base = { type: ElementType.Parameter } as const
	const prm = literal<TypedParameter<ParameterType.String>>({ ...base, parameterType: ParameterType.String })

	function roundtripParameter(prm: Parameter): void {
		const writer = new Ber.Writer()
		encodeParameter(prm, writer)
		console.log(writer.buffer)
		const reader = new Ber.Reader(writer.buffer)
		const decoded = guarded(decodeParameter(reader))

		expect(decoded).toEqual(prm)
	}

	test('write and read a parameter', () => {
		roundtripParameter(prm)
	})

	test('write and read a parameter - identifer', () => {
		const param: Parameter = {
			...prm,
			identifier: 'Angela',
		}

		roundtripParameter(param)
	})

	test('write and read a parameter - description', () => {
		const param: Parameter = {
			...prm,
			description: 'This parameter is\nsupposed to be a good boy',
		}

		roundtripParameter(param)
	})

	test('write and read a parameter - value', () => {
		const param: Parameter = {
			...prm,
			value: 'Oscar',
		}

		roundtripParameter(param)
	})

	describe('type field', () => {
		const fieldsOf = (param: Parameter): number[] => {
			const writer = new Ber.Writer()
			encodeParameter(param, writer)
			const reader = new Ber.Reader(writer.buffer)
			reader.readSequence(Ber.BERDataTypes.SET)
			const end = reader.offset + reader.length
			const fields: number[] = []
			while (reader.offset < end) {
				const tag = reader.readSequence()
				if (tag === null) break
				fields.push(tag)
				const inner = reader.peek()
				if (inner !== null) reader.readStringAsBuffer(inner)
			}
			return fields
		}

		// A value change: the value's own BER type gives its type, as in Lawo's libember
		test('a parameter with only a value has no type field', () => {
			expect(fieldsOf({ ...base, parameterType: ParameterType.Integer, value: 20 })).toEqual([Ber.CONTEXT(2)])
		})

		test('a parameter with other properties keeps its type field', () => {
			expect(fieldsOf({ ...base, parameterType: ParameterType.Integer, identifier: 'gain', value: 20 })).toEqual([
				Ber.CONTEXT(0),
				Ber.CONTEXT(2),
				Ber.CONTEXT(13),
			])
			expect(fieldsOf({ ...base, parameterType: ParameterType.Trigger })).toEqual([Ber.CONTEXT(13)])
		})
	})

	test('write and read a parameter - maximum', () => {
		const param: Parameter = {
			...base,
			parameterType: ParameterType.Integer,
			maximum: 150,
		}

		roundtripParameter(param)
	})

	test('write and read a parameter - minimum', () => {
		const param: Parameter = {
			...base,
			parameterType: ParameterType.Integer,
			minimum: -22,
		}

		roundtripParameter(param)
	})

	test('write and read a parameter - access', () => {
		const param: Parameter = {
			...prm,
			access: ParameterAccess.ReadWrite,
		}

		roundtripParameter(param)
	})

	test('write and read a parameter - format', () => {
		const param: Parameter = {
			...prm,
			format: '2i%50%F20',
		}

		roundtripParameter(param)
	})

	test('write and read a parameter - enumeration', () => {
		const param: Parameter = {
			...base,
			parameterType: ParameterType.Enum,
			enumeration: '1\n2\n3\n4\n5\n',
		}

		roundtripParameter(param)
	})

	test('write and read a parameter - factor', () => {
		const param: Parameter = {
			...prm,
			factor: 512,
		}

		roundtripParameter(param)
	})

	test('write and read a parameter - isOnline', () => {
		const param: Parameter = {
			...prm,
			isOnline: false,
		}

		roundtripParameter(param)
	})

	test('write and read a parameter - formula', () => {
		const param: Parameter = {
			...prm,
			formula: '1\n1',
		}

		roundtripParameter(param)
	})

	test('write and read a parameter - defaultValue', () => {
		const param: Parameter = {
			...prm,
			defaultValue: 'Michael',
		}

		roundtripParameter(param)
	})

	test('write and read a parameter - streamIdentifier', () => {
		const param: Parameter = {
			...prm,
			streamIdentifier: 33,
		}

		roundtripParameter(param)
	})

	test('write and read a parameter - enumMap', () => {
		const param: Parameter = {
			...base,
			parameterType: ParameterType.Enum,
			enumMap: new Map([
				['Jim', 0],
				['Pam', 1],
			]),
		}

		roundtripParameter(param)
	})

	test('write and read a parameter - streamDescriptor', () => {
		const param: Parameter = {
			...prm,
			streamDescriptor: { format: StreamFormat.UInt8, offset: 22 },
		}

		roundtripParameter(param)
	})

	test('write and read a parameter - schemaIdentifiers', () => {
		const param: Parameter = {
			...prm,
			schemaIdentifiers: '3.2.1.1',
		}

		roundtripParameter(param)
	})

	test('write and read a parameter - templateReference', () => {
		const param: Parameter = {
			...prm,
			templateReference: '3.2.1.1',
		}

		roundtripParameter(param)
	})

	test('read a templateReference in the UTF8String form earlier versions of this library wrote', () => {
		const writer = new Ber.Writer()
		writer.startSequence(Ber.BERDataTypes.SET)
		writer.startSequence(Ber.CONTEXT(18))
		writer.writeString('3.2.1.1', Ber.BERDataTypes.STRING)
		writer.endSequence()
		writer.endSequence()

		expect(decodeParameter(new Ber.Reader(writer.buffer)).value.templateReference).toBe('3.2.1.1')
	})

	test('write and read a parameter - all', () => {
		const param: Parameter = {
			...base,
			parameterType: ParameterType.Enum,
			identifier: 'Angela',
			description: 'This parameter is\nsupposed to be a good boy',
			value: 24,
			maximum: 150,
			minimum: -22,
			access: ParameterAccess.ReadWrite,
			format: '2i%50%F20',
			enumeration: '1\n2\n3\n4\n5\n',
			factor: 512,
			isOnline: false,
			formula: '1\n1',
			defaultValue: 0,
			streamIdentifier: 33,
			enumMap: new Map([
				['Jim', 0],
				['Pam', 1],
			]),
			streamDescriptor: new StreamDescriptionImpl(StreamFormat.UInt8, 22),
			schemaIdentifiers: '3.2.1.1',
			templateReference: '3.2.1.1',
		}

		roundtripParameter(param)
	})

	// In the Glow DTD, minimum and maximum are MinMax: a CHOICE of integer, real or null, whatever the
	// parameter type.
	describe('minimum and maximum', () => {
		const parameterTypes = [
			ParameterType.Integer,
			ParameterType.Real,
			ParameterType.String,
			ParameterType.Boolean,
			ParameterType.Enum,
			ParameterType.Octets,
		]

		test.each(parameterTypes)('%s parameter with integer limits', (parameterType) => {
			roundtripParameter({ ...base, parameterType, minimum: -22, maximum: 2048 })
		})
		test.each(parameterTypes)('%s parameter with real limits', (parameterType) => {
			roundtripParameter({ ...base, parameterType, minimum: -12.5, maximum: 6.25 })
		})
		test.each(parameterTypes)('%s parameter with null limits', (parameterType) => {
			roundtripParameter({ ...base, parameterType, minimum: null, maximum: null })
		})

		test('encodes a limit by its value', () => {
			const maximumTag = (param: Parameter): number => {
				const writer = new Ber.Writer()
				encodeParameter(param, writer)
				return writer.buffer[writer.buffer.indexOf(Ber.CONTEXT(4)) + 2]
			}

			expect(maximumTag({ ...base, parameterType: ParameterType.String, maximum: 2048 })).toBe(
				Ber.BERDataTypes.INTEGER
			)
			expect(maximumTag({ ...base, parameterType: ParameterType.Integer, maximum: 2.5 })).toBe(
				Ber.BERDataTypes.REAL
			)
			expect(maximumTag({ ...base, parameterType: ParameterType.Real, maximum: 2048 })).toBe(
				Ber.BERDataTypes.REAL
			)
			expect(maximumTag({ ...base, parameterType: ParameterType.Boolean, maximum: null })).toBe(
				Ber.BERDataTypes.NULL
			)
		})

		// The DTD's MinMax is an integer, a real or null. A limit of another type was kept, typed as a number.
		test('decodes a limit of another type as none, with an error', () => {
			const writer = new Ber.Writer()
			writer.startSequence(Ber.BERDataTypes.SET)
			writer.startSequence(Ber.CONTEXT(3))
			writer.writeString('0', Ber.BERDataTypes.STRING)
			writer.endSequence()
			writer.startSequence(Ber.CONTEXT(4))
			writer.writeBoolean(true)
			writer.endSequence()
			writer.endSequence()

			const decoded = decodeParameter(new Ber.Reader(writer.buffer))

			expect(decoded.value.minimum).toBeUndefined()
			expect(decoded.value.maximum).toBeUndefined()
			expect(decoded.errors?.map(String)).toEqual(
				expect.arrayContaining([
					expect.stringContaining('minimum of the type STRING is not an integer, real or null'),
					expect.stringContaining('maximum of the type BOOLEAN is not an integer, real or null'),
				])
			)
		})

		test('refuses a limit of another type when unexpected values are not to be skipped', () => {
			const writer = new Ber.Writer()
			writer.startSequence(Ber.BERDataTypes.SET)
			writer.startSequence(Ber.CONTEXT(3))
			writer.writeString('0', Ber.BERDataTypes.STRING)
			writer.endSequence()
			writer.endSequence()

			expect(() =>
				decodeParameter(new Ber.Reader(writer.buffer), {
					skipApplicationTags: true,
					skipContextTags: true,
					substituteForRequired: true,
					skipUnexpected: false,
				})
			).toThrow(/minimum of the type STRING/)
		})

		test('leaves out a limit that is not a number', () => {
			// e.g. a string limit decoded from a provider that encoded it with the parameter's type
			const writer = new Ber.Writer()
			encodeParameter({ ...prm, maximum: '2048' as unknown as number }, writer)
			const decoded = guarded(decodeParameter(new Ber.Reader(writer.buffer)))

			expect(decoded.maximum).toBeUndefined()
		})
	})
})
