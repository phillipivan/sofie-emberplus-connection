import { Reader } from '../ASN1/ber/reader.js'
import { ASN1Error, UnimplementedEmberTypeError } from '../Errors.js'
import { ParameterType } from '../model/Parameter.js'
import { EmberTypedValue, isRelativeOID, RelativeOID } from '../types/types.js'
import { BERDataTypes } from './BERDataTypes.js'
import { hasInteger32Arcs, UNIVERSAL } from './functions.js'
import { shl64 } from './uint64.js'

export { ExtendedReader as Reader }

function isBerDataType(test: number | string): test is BERDataTypes {
	return Object.values<number | string>(BERDataTypes).indexOf(test) !== -1
}

class ExtendedReader extends Reader {
	constructor(data: Buffer) {
		super(data)
	}

	// This is bad. No need to create a new reader for every tag!
	// getSequence(tag: number): ExtendedReader {
	// 	const buf = this.readString(tag, true)
	// 	return new ExtendedReader(buf)
	// }

	/**
	 * A RELATIVE-OID as the numeric path (RelativeOID) it is: its numbers joined by '.'. One with a number above 2^31 - 1
	 * isn't an Ember+ path (the Glow DTD's numbers are Integer32), and is read as none, as the decoders take a value that
	 * isn't a path; its 32-bit reading made such a number negative, which wasn't a path either, only by chance.
	 */
	readRelativeOID(tag?: number): RelativeOID | null {
		const oid = super.readRelativeOID(tag)
		return oid !== null && isRelativeOID(oid) && hasInteger32Arcs(oid) ? oid : null
	}

	readValue(): EmberTypedValue {
		const tag = this.peek()
		if (!tag) {
			throw new Error('No tag available')
		}
		if (!isBerDataType(tag)) throw new UnimplementedEmberTypeError(tag)
		switch (tag) {
			case BERDataTypes.STRING:
				return { type: ParameterType.String, value: this.readString(BERDataTypes.STRING) }
			case BERDataTypes.INTEGER:
				return { type: ParameterType.Integer, value: this.readInt() }
			case BERDataTypes.REAL:
				return { type: ParameterType.Real, value: this.readReal() }
			case BERDataTypes.BOOLEAN:
				return { type: ParameterType.Boolean, value: this.readBoolean() }
			case BERDataTypes.OCTETSTRING:
				return { type: ParameterType.Octets, value: this.readStringAsBuffer(UNIVERSAL(4)) }
			case BERDataTypes.ENUMERATED:
				// Not one of the DTD's Value types, but earlier versions of this library wrote an enum's value with it
				return { type: ParameterType.Integer, value: this.readEnumeration() }
			case BERDataTypes.RELATIVE_OID:
				// Not one of the DTD's Value types; read as the relative OID it is (not as an absolute one, which splits
				// its first byte into two arcs)
				return { type: ParameterType.String, value: this.readRelativeOID(BERDataTypes.RELATIVE_OID) }
			case BERDataTypes.NULL:
				// No readNull in the BER library: read past the tag (one byte or more) and its empty contents
				this.readStringAsBuffer(BERDataTypes.NULL)
				return { type: ParameterType.Null, value: null }
			default:
				throw new UnimplementedEmberTypeError(tag)
		}
	}

	// the tag is read from the data
	readReal(_tag?: number): number | null {
		const b = this.peek()
		if (b === null) {
			return null
		}

		const buf = this.readStringAsBuffer(b)
		if (!buf || buf.length === 0) {
			return 0
		}

		const preamble = buf.readUInt8(0)
		let o = 1

		// The special values, as libember reads them (Real.hpp)
		if (buf.length === 1) {
			switch (preamble) {
				case 0x40:
					return Infinity
				case 0x41:
					return -Infinity
				case 0x42:
					return NaN
				case 0x43:
					return -0
			}
		}

		const sign = preamble & 0x40 ? -1 : 1
		const exponentLength = 1 + (preamble & 3)
		const significandShift = (preamble >> 2) & 3

		// Before reading the exponent's first byte: any other single byte has none
		if (buf.length - o < exponentLength) {
			throw new ASN1Error('Invalid ASN.1; not enough length to contain exponent')
		}

		let exponent = 0

		if (buf.readUInt8(o) & 0x80) {
			exponent = -1
		}

		for (let i = 0; i < exponentLength; i++) {
			exponent = (exponent << 8) | buf.readUInt8(o++)
		}

		let significand = 0n
		while (o < buf.length) {
			significand = shl64(significand, 8n) | BigInt(buf.readUInt8(o++))
		}

		significand = shl64(significand, BigInt(significandShift))

		// A zero significand represents the value zero and has no leading bit to normalise
		if (significand === 0n) {
			return sign < 0 ? -0 : 0
		}

		// As libember (Real.hpp), the significand's leading bit stands for 2^exponent: it is moved to bit 52, the
		// double's implicit bit, and the 52 bits after it are the fraction. libember moves it only to the left, so one
		// longer than 53 bits lost its leading bits, and one of only bit 63 was shifted to 0 and looped forever. Bits
		// past the 53rd are dropped.
		const significandBits = significand.toString(2).length
		significand =
			significandBits > 53
				? significand >> BigInt(significandBits - 53)
				: significand << BigInt(53 - significandBits)
		significand = significand & 0x000f_ffff_ffff_ffffn

		let bits = shl64(BigInt(exponent) + 1023n, 52n) | significand
		if (sign < 0) {
			bits = bits | 0x8000_0000_0000_0000n
		}

		const fbuf = Buffer.alloc(8)
		fbuf.writeBigUInt64LE(bits, 0)

		return fbuf.readDoubleLE(0)
	}
}
