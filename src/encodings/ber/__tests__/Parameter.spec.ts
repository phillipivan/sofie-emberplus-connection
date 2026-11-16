import * as Ber from '../../../Ber/index.js'
import { ElementType } from '../../../model/EmberElement.js'
import { Parameter, ParameterAccess, ParameterType, TypedParameter } from '../../../model/Parameter.js'
import { StreamDescriptionImpl, StreamFormat } from '../../../model/StreamDescription.js'
import { guarded } from '../decoder/DecodeResult.js'
import { decodeParameter } from '../decoder/Parameter.js'
import { encodeParameter } from '../encoder/Parameter.js'

describe('encodings/ber/Parameter', () => {
	// A parameter's value is tied to its type: each test spreads this base and gives the type
	const base = { type: ElementType.Parameter } as const
	const prm: TypedParameter<ParameterType.String> = { ...base, parameterType: ParameterType.String }

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
	// A parameter's value and default are of its type's form. One that doesn't fit is left out, with an error; both were
	// kept as they came. (The type comes from the value, unless it is a trigger, or an enum by its enumeration.)
	describe('value and default checked against the type', () => {
		/** A parameter's contents: a SET of context fields, each written by the function given */
		const contents = (...fields: Array<[number, (w: Ber.Writer) => void]>) => {
			const writer = new Ber.Writer()
			writer.startSequence(Ber.BERDataTypes.SET)
			for (const [n, write] of fields) {
				writer.startSequence(Ber.CONTEXT(n))
				write(writer)
				writer.endSequence()
			}
			writer.endSequence()
			return new Ber.Reader(writer.buffer)
		}
		const str = (v: string) => (w: Ber.Writer) => w.writeString(v, Ber.BERDataTypes.STRING)
		const int = (v: number) => (w: Ber.Writer) => w.writeInt(v)
		const real = (v: number) => (w: Ber.Writer) => w.writeReal(v, Ber.BERDataTypes.REAL)

		test("leaves out an enum's value that isn't an index, with an error", () => {
			const decoded = decodeParameter(contents([2, str('On')], [7, str('Off\nOn')]))

			expect(decoded.value).toMatchObject({ parameterType: ParameterType.Enum, enumeration: 'Off\nOn' })
			expect(decoded.value.value).toBeUndefined()
			expect(decoded.errors?.map(String)).toEqual([
				expect.stringContaining("a value of the type STRING doesn't fit a parameter of the type ENUM"),
			])
		})

		test("leaves out a default that doesn't fit the type, with an error, and keeps the value", () => {
			const decoded = decodeParameter(contents([2, str('a')], [12, int(0)], [13, int(3)]))

			expect(decoded.value).toMatchObject({ parameterType: ParameterType.String, value: 'a' })
			expect(decoded.value.defaultValue).toBeUndefined()
			expect(decoded.errors?.map(String)).toEqual([
				expect.stringContaining("a default of the type INTEGER doesn't fit a parameter of the type STRING"),
			])
		})

		test.each<[string, Ber.Reader, Partial<Parameter>]>([
			[
				'an integer parameter with a real default',
				contents([2, int(3)], [12, real(1.5)], [13, int(1)]),
				{ parameterType: ParameterType.Integer, value: 3, defaultValue: 1.5 },
			],
			[
				'a trigger with a string value and an integer default',
				contents([2, str('go')], [12, int(1)], [13, int(5)]),
				{ parameterType: ParameterType.Trigger, value: 'go', defaultValue: 1 },
			],
			[
				'a null value and default of any type',
				contents([2, (w) => w.writeNull()], [12, (w) => w.writeNull()], [13, int(4)]),
				{ parameterType: ParameterType.Boolean, value: null, defaultValue: null },
			],
		])('keeps %s', (_, reader, expected) => {
			const decoded = decodeParameter(reader)

			expect(decoded.value).toMatchObject(expected)
			expect(decoded.errors).toEqual([])
		})

		test('refuses a value that does not fit when unexpected values are not to be skipped', () => {
			expect(() =>
				decodeParameter(contents([2, str('On')], [7, str('Off\nOn')]), {
					skipApplicationTags: true,
					skipContextTags: true,
					substituteForRequired: true,
					skipUnexpected: false,
				})
			).toThrow(/doesn't fit a parameter of the type ENUM/)
		})
	})

	// A value or default that doesn't fit the parameter's type, from a caller that doesn't check types, is refused. It was
	// coerced (Number(), + ''), written as NaN for a real, thrown on by the writer, or written as a NULL for a Null
	// parameter whatever it was.
	describe('encoding a value of the wrong form', () => {
		test.each<[string, unknown]>([
			["an integer parameter's string value", { ...base, parameterType: ParameterType.Integer, value: '5' }],
			["a real parameter's string value", { ...base, parameterType: ParameterType.Real, value: 'x' }],
			["a string parameter's number value", { ...base, parameterType: ParameterType.String, value: 5 }],
			["a Null parameter's number value", { ...base, parameterType: ParameterType.Null, value: 5 }],
			[
				"a boolean parameter's number default",
				{ ...base, parameterType: ParameterType.Boolean, defaultValue: 1 },
			],
		])('refuses %s', (_, parameter) => {
			expect(() => encodeParameter(parameter as Parameter, new Ber.Writer())).toThrow(/doesn't fit a parameter/)
		})

		test("writes a trigger's value by its own type, and an enum's as an integer", () => {
			const fieldTag = (param: Parameter, field: number): number => {
				const writer = new Ber.Writer()
				encodeParameter(param, writer)
				return writer.buffer[writer.buffer.indexOf(Ber.CONTEXT(field)) + 2]
			}

			expect(fieldTag({ ...base, parameterType: ParameterType.Trigger, value: 'go' }, 2)).toBe(
				Ber.BERDataTypes.STRING
			)
			expect(fieldTag({ ...base, parameterType: ParameterType.Enum, value: 2, defaultValue: 0 }, 12)).toBe(
				Ber.BERDataTypes.INTEGER
			)
		})
	})

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
