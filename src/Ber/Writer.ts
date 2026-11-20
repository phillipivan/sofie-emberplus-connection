import { Writer, WriterOptions } from '../ASN1/ber/writer.js'
import { ParameterType } from '../model/Parameter.js'
import { EmberTypedValue, EmberValue } from '../types/types.js'
import { BERDataTypes } from './BERDataTypes.js'
import { CONTEXT, hasInteger32Arcs, UNIVERSAL } from './functions.js'
import { shl64 } from './uint64.js'

export { ExtendedWriter as Writer }

class ExtendedWriter extends Writer {
	constructor(options?: WriterOptions) {
		super(options)
	}

	/**
	 * A RELATIVE-OID as Ember+ has it: one with a number above 2^31 - 1 is refused, the Glow DTD's numbers being
	 * Integer32. It was written as it came, and read back as another (2^31 as 0) or not at all.
	 */
	writeRelativeOID(s: string, tag: number): void {
		if (typeof s === 'string' && !hasInteger32Arcs(s)) {
			throw new Error(`RELATIVE-OID ${s} has a number above 2^31 - 1, the largest an Ember+ path takes`)
		}
		super.writeRelativeOID(s, tag)
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

		const bits = fbuf.readBigUInt64LE(0)

		let significand = (bits & 0x000f_ffff_ffff_ffffn) | 0x0010_0000_0000_0000n

		const exponent = Number((bits & 0x7ff0_0000_0000_0000n) >> 52n) - 1023

		while ((significand & 0xffn) === 0n) {
			significand = significand >> 8n
		}

		while ((significand & 0x01n) === 0n) {
			significand = significand >> 1n
		}

		const shortExp = shorten(exponent)
		const shortSig = shortenUint64(significand)

		this.writeLength(1 + shortExp.size + shortSig.size)

		// As libember (Real.hpp): binary form, 0x40 for a negative value, and the exponent's length (1 to 4 bytes)
		// less one in the last two bits
		const preamble = 0x80 | (value < 0 ? 0x40 : 0) | (shortExp.size - 1)
		this.writeByte(preamble)

		for (let i = 0; i < shortExp.size; i++) {
			this.writeByte((shortExp.value & 0xff000000) >> 24)
			shortExp.value <<= 8
		}

		for (let i = 0; i < shortSig.size; i++) {
			this.writeByte(Number(shortSig.value >> 56n))
			shortSig.value = shl64(shortSig.value, 8n)
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

function shortenUint64(value: bigint): { size: number; value: bigint } {
	const mask = 0xff80_0000_0000_0000n

	let size = 8
	while ((value & mask) === 0n || ((value & mask) === mask && size > 1)) {
		size--
		value = shl64(value, 8n)
	}

	return { size, value }
}
