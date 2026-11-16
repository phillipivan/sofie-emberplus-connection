import Long from 'long'

import { Writer, WriterOptions } from '../ASN1/ber/writer.js'
import { ParameterType } from '../model/Parameter.js'
import { EmberTypedValue, EmberValue } from '../types/types.js'
import { BERDataTypes } from './BERDataTypes.js'
import { CONTEXT, UNIVERSAL } from './functions.js'

export { ExtendedWriter as Writer }

class ExtendedWriter extends Writer {
	constructor(options?: WriterOptions) {
		super(options)
	}

	writeReal(value: number, tag: number): void {
		if (tag === undefined) {
			tag = UNIVERSAL(9)
		}

		this.writeTag(tag)

		// The special values as libember sends them (Real.hpp): no contents for +0.0, one byte for the others
		if (Object.is(value, -0)) {
			// `case 0` below matches −0.0 too
			this.writeLength(1)
			this.writeByte(0x43)
			return
		}
		switch (value) {
			case 0:
				this.writeLength(0)
				return
			case Infinity:
				this.writeLength(1)
				this.writeByte(0x40)
				return
			case -Infinity:
				this.writeLength(1)
				this.writeByte(0x41)
				return
			default:
				if (isNaN(value)) {
					this.writeLength(1)
					this.writeByte(0x42)
					return
				}
		}

		const fbuf = Buffer.alloc(8)
		fbuf.writeDoubleLE(value, 0)

		const bits = Long.fromBits(fbuf.readUInt32LE(0), fbuf.readUInt32LE(4), true)

		let significand = bits
			.and(Long.fromBits(0xffffffff, 0x000fffff, true))
			.or(Long.fromBits(0x00000000, 0x00100000, true))

		let exponent: Long | number = bits
			.and(Long.fromBits(0x00000000, 0x7ff00000, true))
			.shru(52)
			.sub(1023)
			.toSigned()

		while (significand.and(0xff).toNumber() === 0) {
			significand = significand.shru(8)
		}

		while (significand.and(0x01).toNumber() === 0) {
			significand = significand.shru(1)
		}

		exponent = exponent.toNumber()

		const shortExp = shorten(exponent)
		const shortSig = shortenLong(significand)

		this.writeLength(1 + shortExp.size + shortSig.size)

		// As libember (Real.hpp): binary form, 0x40 for a negative value, and the exponent's length (1 to 4 bytes)
		// less one in the last two bits
		const preamble = 0x80 | (value < 0 ? 0x40 : 0) | (shortExp.size - 1)
		this.writeByte(preamble)

		for (let i = 0; i < shortExp.size; i++) {
			this.writeByte((shortExp.value & 0xff000000) >> 24)
			shortExp.value <<= 8
		}

		const mask = Long.fromBits(0x00000000, 0xff000000, true)
		for (let i = 0; i < shortSig.size; i++) {
			this.writeByte(shortSig.value.and(mask).shru(56).toNumber())
			shortSig.value = shortSig.value.shl(8)
		}
	}

	writeValue(value: EmberValue, tag?: number): void
	writeValue(typedValue: EmberTypedValue): void
	writeValue(arg1: EmberValue | EmberTypedValue, tag?: number): void {
		if (arg1 && typeof arg1 === 'object' && 'type' in arg1) {
			this.writeTypedValue(arg1)
			return
		}
		const value = arg1

		if (tag === BERDataTypes.NULL && (value === null || value === undefined)) {
			this.writeNull()
			return
		}
		if (value === null || value === undefined) {
			this.writeNull()
			return
		}

		if (typeof value === 'number') {
			if (tag !== BERDataTypes.REAL && Number.isInteger(value)) {
				if (tag === undefined) {
					tag = BERDataTypes.INTEGER
				}
				this.writeInt(value, tag)
				return
			}

			if (tag === undefined) {
				tag = BERDataTypes.REAL
			}
			this.writeReal(value, tag)
			return
		}

		if (typeof value == 'boolean') {
			if (tag === undefined) {
				tag = BERDataTypes.BOOLEAN
			}
			this.writeBoolean(value, tag)
			return
		}

		if (Buffer.isBuffer(value)) {
			if (tag === undefined) tag = BERDataTypes.OCTETSTRING
			this.writeBuffer(value, tag) // writes an empty buffer as a zero-length TLV
			return
		}

		if (tag === undefined) {
			tag = BERDataTypes.STRING
		}
		this.writeString(value.toString(), tag)
	}

	/**
	 * Writes a value as its type says, as one of the DTD's Value types (integer, real, string, boolean, octets or null).
	 * An enum's value is the integer it is. A trigger has no value type of its own: its value is written by its
	 * JavaScript type. (The type used to give only the tag, and the JavaScript value how to write under it, so an
	 * integer's fraction came out as a REAL under an INTEGER tag.)
	 */
	private writeTypedValue(typed: EmberTypedValue): void {
		// Null's value, and any type's null value (TypeScript then leaves Null out of the cases below)
		if (typed.value === null) {
			this.writeNull()
			return
		}
		switch (typed.type) {
			case ParameterType.Integer:
			case ParameterType.Enum:
				this.writeInt(typed.value, BERDataTypes.INTEGER) // a fraction is dropped
				break
			case ParameterType.Real:
				this.writeReal(typed.value, BERDataTypes.REAL)
				break
			case ParameterType.String:
				this.writeString(typed.value, BERDataTypes.STRING)
				break
			case ParameterType.Boolean:
				this.writeBoolean(typed.value, BERDataTypes.BOOLEAN)
				break
			case ParameterType.Octets:
				this.writeValue(typed.value, BERDataTypes.OCTETSTRING) // an empty Buffer too
				break
			case ParameterType.Trigger:
				this.writeValue(typed.value)
				break
		}
	}

	writeIfDefined<T>(
		property: T | undefined,
		writer: (value: T, tag: number) => void,
		outer: number,
		inner: number
	): void {
		if (property != null) {
			this.startSequence(CONTEXT(outer))
			writer.call(this, property, inner)
			this.endSequence()
		}
	}
}

function shorten(value: number): { size: number; value: number } {
	let size = 4
	while (((value & 0xff800000) === 0 || (value & 0xff800000) === 0xff800000 >> 0) && size > 1) {
		size--
		value <<= 8
	}

	return { size, value }
}

function shortenLong(value: Long): { size: number; value: Long } {
	const mask = Long.fromBits(0x00000000, 0xff800000, true)
	value = value.toUnsigned()

	let size = 8
	while (value.and(mask).eq(0) || (value.and(mask).eq(mask) && size > 1)) {
		size--
		value = value.shl(8)
	}

	return { size, value }
}
