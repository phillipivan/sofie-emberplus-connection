import { Reader } from 'asn1'
import Long from 'long'
import { ASN1Error, UnimplementedEmberTypeError } from '../Errors'
import {
	EMBER_BOOLEAN,
	EMBER_INTEGER,
	EMBER_OCTETSTRING,
	EMBER_REAL,
	EMBER_RELATIVE_OID,
	EMBER_STRING
} from './constants'
import { UNIVERSAL } from './functions.js'

export { ExtendedReader as Reader }

class ExtendedReader extends Reader {
	constructor(data: Buffer) {
		super(data)
	}

	getSequence(tag: number): ExtendedReader {
		const buf = this.readString(tag, true)
		return new ExtendedReader(buf)
	}

	readValue() {
		const tag = this.peek()
		if (!tag) {
			throw new Error('No tag available')
		}

		switch (tag) {
			case EMBER_STRING:
				return this.readString(EMBER_STRING)
			case EMBER_INTEGER:
				return this.readInt()
			case EMBER_REAL:
				return this.readReal()
			case EMBER_BOOLEAN:
				return this.readBoolean()
			case EMBER_OCTETSTRING:
				return this.readString(UNIVERSAL(4), true)
			case EMBER_RELATIVE_OID:
				return this.readOID(EMBER_RELATIVE_OID)
			default:
				throw new UnimplementedEmberTypeError(tag)
		}
	}

	readReal(tag?: number) {
		if (tag !== null) {
			tag = UNIVERSAL(9)
		}

		const b = this.peek()
		if (b === null) {
			return null
		}

		const buf = this.readString(b, true)
		if (buf.length === 0) {
			return 0
		}

		const preamble = buf.readUInt8(0)
		let o = 1

		if (buf.length === 1) {
			switch (preamble) {
				case 0x40:
					return Infinity
				case 0x41:
					return -Infinity
				case 0x42:
					return NaN
			}
		}

		const sign = preamble & 0x40 ? -1 : 1
		const exponentLength = 1 + (preamble & 3)
		const significandShift = (preamble >> 2) & 3

		let exponent = 0

		if (buf.readUInt8(o) & 0x80) {
			exponent = -1
		}

		if (buf.length - o < exponentLength) {
			throw new ASN1Error('Invalid ASN.1; not enough length to contain exponent')
		}

		for (var i = 0; i < exponentLength; i++) {
			exponent = (exponent << 8) | buf.readUInt8(o++)
		}

		let significand = new Long(0, 0, true)
		while (o < buf.length) {
			significand = significand.shl(8).or(buf.readUInt8(o++))
		}

		significand = significand.shl(significandShift)

		while (significand.and(Long.fromBits(0x00000000, 0x7ffff000, true)).eq(0)) {
			significand = significand.shl(8)
		}

		while (significand.and(Long.fromBits(0x00000000, 0x7ff00000, true)).eq(0)) {
			significand = significand.shl(1)
		}

		significand = significand.and(Long.fromBits(0xffffffff, 0x000fffff, true))

		let bits = Long.fromNumber(exponent).add(1023).shl(52).or(significand)
		if (sign < 0) {
			bits = bits.or(Long.fromBits(0x00000000, 0x80000000, true))
		}

		const fbuf = Buffer.alloc(8)
		fbuf.writeUInt32LE(bits.getLowBitsUnsigned(), 0)
		fbuf.writeUInt32LE(bits.getHighBitsUnsigned(), 4)

		return fbuf.readDoubleLE(0)
	}
}
