import { ParameterType } from '../../model/Parameter.js'
import { EmberTypedValue } from '../../types/types.js'
import { BERDataTypes } from '../BERDataTypes.js'
import { Writer } from '../Writer.js'

describe('BER', () => {
	// A typed value is written as its type says. The type gave only the tag, and the JavaScript value how to write under
	// it: an integer with a fraction came out as a REAL under an INTEGER tag, and a mismatched value as other bytes
	// under the type's tag.
	describe('Writer.writeValue, a typed value', () => {
		const written = (typed: EmberTypedValue) => {
			const w = new Writer()
			w.writeValue(typed)
			return w.buffer.toString('hex')
		}

		test.each<[string, EmberTypedValue, string]>([
			['an integer', { type: ParameterType.Integer, value: 300 }, '0202012c'],
			['an integer with a fraction, without it', { type: ParameterType.Integer, value: 1.5 }, '020101'],
			['an enum, as an integer', { type: ParameterType.Enum, value: 2.9 }, '020102'],
			// libember's REAL form (Real.hpp), as the REAL fixes have it
			['a real that is a whole number, as a real', { type: ParameterType.Real, value: 4 }, '0903800201'],
			['a string', { type: ParameterType.String, value: 'go' }, '0c02676f'],
			['a boolean', { type: ParameterType.Boolean, value: false }, '010100'],
			['octets', { type: ParameterType.Octets, value: Buffer.from([0xfe]) }, '0401fe'],
			['empty octets', { type: ParameterType.Octets, value: Buffer.alloc(0) }, '0400'],
			['null', { type: ParameterType.Null, value: null }, '0500'],
			["an integer's null value", { type: ParameterType.Integer, value: null }, '0500'],
		])('writes %s', (_, typed, hex) => {
			expect(written(typed)).toBe(hex)
		})

		test.each<[string, unknown]>([
			['a string type with a number', { type: ParameterType.String, value: 5 }],
			['a boolean type with a string', { type: ParameterType.Boolean, value: 'x' }],
			['an integer type with a string', { type: ParameterType.Integer, value: '5' }],
		])("refuses %s from a caller that doesn't check types", (_, typed) => {
			expect(() => written(typed as EmberTypedValue)).toThrow(TypeError)
		})
	})

	describe('Writer.writeValue, an untyped Buffer', () => {
		test.each<[string, Buffer, number | undefined, string]>([
			['octets', Buffer.from([0xfe]), undefined, '0401fe'],
			['empty octets', Buffer.alloc(0), undefined, '0400'],
			['octets under a tag', Buffer.from([0xfe]), 0x80, '8001fe'],
			['empty octets under a tag', Buffer.alloc(0), 0x80, '8000'],
		])('writes %s', (_, value, tag, hex) => {
			const w = new Writer()
			w.writeValue(value, tag)
			expect(w.buffer.toString('hex')).toBe(hex)
		})
	})

	describe('Writer', () => {
		test('Real', () => {
			const w = new Writer()
			w.writeReal(8.32, BERDataTypes.REAL)

			const expected = Buffer.from([0x09, 0x09, 0x80, 0x03, 0x04, 0x28, 0xf5, 0xc2, 0x8f, 0x5c, 0x29])
			expect(w.buffer).toEqual(expected)
		})
	})
})

// An Ember+ path's numbers are Integer32 (Glow DTD): one above 2^31 - 1 is refused, which was written as it came and
// read back as another (2^31 as 0)
describe('BER Writer.writeRelativeOID', () => {
	test('writes a path whose numbers fit in an Integer32', () => {
		const w = new Writer()
		w.writeRelativeOID('1.2147483647', BERDataTypes.RELATIVE_OID)
		expect(w.buffer).toEqual(Buffer.from([0x0d, 0x06, 0x01, 0x87, 0xff, 0xff, 0xff, 0x7f]))
	})

	test.each(['2147483648', '1.2.2147483648', '1.99999999999999999999'])('refuses %s', (path) => {
		expect(() => new Writer().writeRelativeOID(path, BERDataTypes.RELATIVE_OID)).toThrow(
			`RELATIVE-OID ${path} has a number above 2^31 - 1, the largest an Ember+ path takes`
		)
	})
})
