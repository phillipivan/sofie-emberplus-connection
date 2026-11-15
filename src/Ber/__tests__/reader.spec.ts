import { ParameterType } from '../../model/Parameter.js'
import { BERDataTypes } from '../BERDataTypes.js'
import { Reader } from '../Reader.js'
import { Writer } from '../Writer.js'

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
