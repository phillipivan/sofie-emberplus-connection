import vm from 'vm'

import { ParameterType } from '../../model/Parameter.js'
import { BERDataTypes } from '../BERDataTypes.js'
import { Reader } from '../Reader.js'
import { Writer } from '../Writer.js'

describe('BER Reader.readValue', () => {
	// Earlier versions of this library wrote a value of the type Enum with the tag ENUMERATED (#51)
	test('reads an ENUMERATED value as the integer it is', () => {
		expect(new Reader(Buffer.from('0a0102', 'hex')).readValue()).toEqual({ type: ParameterType.Integer, value: 2 })
	})

	// Not one of the DTD's Value types; it was read as an absolute OID, whose first byte holds two arcs, so 1.2.3 read
	// as 0.1.2.3 (#58). (libember's Value reads a type outside the CHOICE as the integer 0.)
	test.each([
		['1.2.3', '0d03010203'],
		['1.200.3', '0d0401814803'],
		['0', '0d0100'],
		['', '0d00'],
	])('reads a RELATIVE-OID value %j as the relative OID it is', (oid, encoded) => {
		expect(new Reader(Buffer.from(encoded, 'hex')).readValue()).toEqual({ type: ParameterType.String, value: oid })
	})

	test('reads back a value of the type Enum as an integer', () => {
		const writer = new Writer()
		writer.writeValue({ type: ParameterType.Enum, value: 2 })

		expect(new Reader(writer.buffer).readValue()).toEqual({ type: ParameterType.Integer, value: 2 })
	})
})

describe('BER Reader.readReal', () => {
	// Regression for the infinite-loop DoS: a non-canonical REAL with an explicit
	// all-zero significand must short-circuit to 0 rather than spin the
	// normalisation loops forever. Tight timeout so a regression fails fast.
	test('zero-significand REAL returns 0 quickly', () => {
		// 09 (REAL tag) 03 (length) 00 (preamble) 00 (exponent) 00 (significand)
		const buf = Buffer.from([BERDataTypes.REAL, 0x03, 0x00, 0x00, 0x00])

		const r = new Reader(buf)
		expect(r.readReal()).toEqual(0)
	}, 2000)

	test('zero-significand REAL via readValue returns 0 quickly', () => {
		const buf = Buffer.from([BERDataTypes.REAL, 0x03, 0x00, 0x00, 0x00])

		const r = new Reader(buf)
		expect(r.readValue().value).toEqual(0)
	}, 2000)

	// The significand was normalised by shifting it left until a bit landed below its top one, as libember does
	// (Real.hpp). One of only its top bit set was shifted to 0 and looped forever; one longer than 53 bits wasn't
	// shifted, and lost its leading bits. libember writes at most 53, so only a malformed message has them. The leading
	// bit stands for 2^exponent, as with a shorter one, and the bits past 53 are dropped.
	describe('a significand longer than 53 bits', () => {
		// Under vm's timeout, which interrupts a synchronous loop that the test runner's timeout can't
		const read = (hex: string): unknown => {
			try {
				return vm.runInNewContext(
					'read()',
					{ read: () => new Reader(Buffer.from(hex, 'hex')).readReal() },
					{
						timeout: 1000,
					}
				)
			} catch (e) {
				return (e as { code?: unknown } | null)?.code ?? e
			}
		}

		test.each<[string, string, number]>([
			['only its top bit set', '090a80008000000000000000', 1],
			['only its top bit set, negative, with an exponent', '090ac0038000000000000000', -8],
			['its two top bits set', '090a8000c000000000000000', 1.5],
			['of 55 bits', '0909800060000000000000', 1.5],
			['of 64 bits, its last ones dropped', '090a80018000000000000fff', 2 + 2 ** -51],
		])('%s', (_, hex, value) => {
			expect(read(hex)).toBe(value)
		})
	})

	test('normal REAL values still decode', () => {
		for (const value of [8.32, -8.32, 1, -1, 1234.5, 0.0001]) {
			const w = new Writer()
			w.writeReal(value, BERDataTypes.REAL)

			const r = new Reader(w.buffer)
			expect(r.readReal()).toBeCloseTo(value)
		}
	})
})

// The special values as libember sends and reads them (libember/Headers/ember/ber/traits/Real.hpp): contents 40 +∞,
// 41 −∞, 42 NaN, 43 −0.0, and no contents for +0.0
describe('BER REAL special values, as libember', () => {
	const read = (hex: string) => new Reader(Buffer.from(hex, 'hex')).readReal()

	test.each<[string, number]>([
		['0900', 0],
		['090143', -0],
		['090140', Infinity],
		['090141', -Infinity],
		['090142', NaN],
	])('reads %s as %p', (hex, value) => {
		expect(Object.is(read(hex), value)).toBe(true)
	})

	test.each<[number, string]>([
		[0, '0900'],
		[-0, '090143'],
		[Infinity, '090140'],
		[-Infinity, '090141'],
		[NaN, '090142'],
	])('writes %p as %s', (value, hex) => {
		const w = new Writer()
		w.writeReal(value, BERDataTypes.REAL)
		expect(w.buffer.toString('hex')).toBe(hex)
	})

	test('-0.0 survives writeValue and readValue', () => {
		const w = new Writer()
		w.writeValue({ type: ParameterType.Real, value: -0 })
		expect(Object.is(new Reader(w.buffer).readValue().value, -0)).toBe(true)
	})

	// libember's NaN check (value == quiet_NaN()) is never true in C++, so it sends NaN through the general form: the
	// exponent 1024 that IEEE 754 gives NaN and infinity, and a mantissa that isn't zero
	test("reads libember's NaN", () => {
		expect(read('090481040003')).toBeNaN()
	})

	// Any other single byte isn't a value: libember throws ("the following call to decode will throw")
	test.each(['090144', '090180', '0901c0'])('rejects %s', (hex) => {
		expect(() => read(hex)).toThrow(/not enough length to contain exponent/)
	})
})

// libember writes the exponent's length in the preamble's last two bits: 0x80 | (exponentLength - 1), with 0x40 for a
// negative value (Real.hpp), and the exponent as a minimal two's complement integer (Integral.hpp). An exponent
// outside -128..127, so |v| >= 2^128 or |v| < 2^-128, takes two bytes.
describe('BER REAL exponent length, as libember', () => {
	test.each<[number, string]>([
		[1.5, '0903800003'],
		[2 ** 127, '0903807f01'],
		[2 ** 128, '090481008001'],
		[-(2 ** 128), '0904c1008001'],
		[1e300, '090a8103e405f90f22001d67'],
		[Number.MAX_VALUE, '090a8103ff1fffffffffffff'],
		[2 ** -128, '0903808001'],
		[2 ** -129, '090481ff7f01'],
		[1e-300, '090a81fc1b156e1fc2f8f359'],
		[2.2250738585072014e-308, '090481fc0201'],
	])('writes %p as %s, and reads it back', (value, hex) => {
		const w = new Writer()
		w.writeReal(value, BERDataTypes.REAL)

		expect(w.buffer.toString('hex')).toBe(hex)
		expect(new Reader(w.buffer).readReal()).toBe(value)
	})
})

describe('BER REAL every exponent', () => {
	// Normal doubles: exponents -1022 to 1023, each with a mantissa of many bits and one of a single bit
	test('a value with each exponent reads back as written', () => {
		const wrong: string[] = []
		for (let exponent = -1022; exponent <= 1023; exponent++) {
			for (const value of [2 ** exponent, -(2 ** exponent) * 1.7182818284590453]) {
				const w = new Writer()
				w.writeReal(value, BERDataTypes.REAL)
				const read = new Reader(w.buffer).readReal()
				if (read !== value) wrong.push(`${value} read as ${read}`)
			}
		}
		expect(wrong).toEqual([])
	})
})

// An Ember+ path's numbers are Integer32 (Glow DTD): one above 2^31 - 1 is read as no path, as a value that isn't one
describe('BER Reader.readRelativeOID', () => {
	test.each([
		{ bytes: [0x01, 0x87, 0xff, 0xff, 0xff, 0x7f], path: '1.2147483647' },
		{ bytes: [0x01, 0x88, 0x80, 0x80, 0x80, 0x00], path: null },
	])('reads $bytes as $path', ({ bytes, path }) => {
		const reader = new Reader(Buffer.from([BERDataTypes.RELATIVE_OID, bytes.length, ...bytes]))
		expect(reader.readRelativeOID(BERDataTypes.RELATIVE_OID)).toBe(path)
	})
})
