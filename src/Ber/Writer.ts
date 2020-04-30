import Long from 'long'
import { Writer, WriterOptions } from 'asn1'

import { CONTEXT, UNIVERSAL } from './functions'
import { BERDataTypes } from './BERDataTypes'
import { Parameter, ParameterType, isParameter } from '../model/Parameter'
import { EmberValue } from '../types/types'

export { ExtendedWriter as Writer }

class ExtendedWriter extends Writer {
	constructor(options: WriterOptions | undefined) {
		super(options)
	}

	writeReal(value: number, tag: number) {
		if (tag === undefined) {
			tag = UNIVERSAL(9)
		}

		this.writeByte(tag)

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

		let exponent = bits
			.and(Long.fromBits(0x00000000, 0x7ff00000, true))
			.shru(52)
			.sub(1023)
			.toSigned()
			.toNumber()

		while (significand.and(0xff) === Long.fromNumber(0)) {
			significand = significand.shru(8)
		}

		while (significand.and(0x01) === Long.fromNumber(0)) {
			significand = significand.shru(1)
		}

		const shortenedExponent = shorten(exponent)
		const shortenedSignificand = shortenLong(significand)

		this.writeLength(1 + shortenedExponent.size + shortenedSignificand.size)

		const preamble = value < 0 ? 0x80 | 0x40 : 0x80 // in what case will 0x80|0x40 be anything but 0xC0?
		this.writeByte(preamble)

		for (let i = 0; i < shortenedExponent.size; i++) {
			this.writeByte((shortenedExponent.value & 0xff000000) >> 24)
			shortenedExponent.value <<= 8
		}

		const mask = Long.fromBits(0x00000000, 0xff000000, true)
		for (let i = 0; i < shortenedSignificand.size; i++) {
			this.writeByte(shortenedSignificand.value.and(mask).shru(56).toNumber())
			shortenedSignificand.value = shortenedSignificand.value.shl(8)
		}
	}

	writeValue(value: EmberValue, tag?: number) {
		// this is inconsistent with the original behavior, which would have thrown a TypeError if value was null or undef
		// TypeScript won't allow doing a value.toString() if value can be null, not sure what to do here
		if (value === null || value === undefined) {
			return
		}

		if (typeof value == 'number') {
			if (Number.isInteger(value)) {
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

		if (Buffer.isBuffer(value) && tag) {
			this.writeBuffer(value, tag)
			return
		}

		if (tag === undefined) {
			tag = BERDataTypes.STRING
		}
		this.writeString(value.toString(), tag)
	}

	writeEmberParameter(value: Parameter) {
		if (isParameter(value)) {
			switch (value.parameterType) {
				case ParameterType.Real:
					this.writeReal(value.value as number, BERDataTypes.REAL)
					break
				case ParameterType.Integer:
					this.writeInt(value.value as number, BERDataTypes.INTEGER)
					break
				case ParameterType.Boolean:
					this.writeBoolean(value.value as boolean, BERDataTypes.BOOLEAN)
					break
				case ParameterType.Octets:
					this.writeBuffer(value.value as Buffer, BERDataTypes.OCTETSTRING)
					break
				default:
					this.writeString(value.value as string, BERDataTypes.STRING)
			}
			if (value.parameterType === ParameterType.Real) {
				const tag = BERDataTypes.REAL
				this.writeReal(value.value as number, tag)
				return
			}
		} else {
			this.writeValue(value as any, undefined)
		}
	}

	writeIfDefined(
		property: any,
		writer: (value: number, tag: number) => {},
		outer: number,
		inner: number
	): void {
		if (property != null) {
			this.startSequence(CONTEXT(outer))
			writer.call(this, property, inner)
			this.endSequence()
		}
	}

	writeIfDefinedEnum(
		property: any,
		type: any,
		writer: (value: number, tag: number) => {},
		outer: number,
		inner: number
	): void {
		if (property != null) {
			this.startSequence(CONTEXT(outer))
			if (property.value != null) {
				writer.call(this, property.value, inner)
			} else {
				writer.call(this, type.get(property), inner)
			}
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
	let mask = Long.fromBits(0x00000000, 0xff800000, true)
	value = value.toUnsigned()

	let size = 8
	while (value.and(mask).eq(0) || (value.and(mask).eq(mask) && size > 1)) {
		size--
		value = value.shl(8)
	}

	return { size, value }
}
