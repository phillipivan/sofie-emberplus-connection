// Copyright 2011 Mark Cavage <mcavage@gmail.com> All rights reserved.

import assert from 'assert'

import { at } from '../../lib/at.js'
import { newInvalidAsn1Error } from './errors.js'
import { readTagAt } from './tag.js'
import { Types } from './types.js'

// X.690 8.1.3.5: the long form takes 1 to 126 length bytes, as many as the first byte's low seven bits say, and that
// byte must not be 0xFF. libember (ber/traits/Length.hpp) reads any number of them, as does this reader now; it
// refused more than four. What keeps a length safe is that it can't run past the data, which the callers check.
const RESERVED_LENGTH = 'Invalid length: the first length byte 0xFF is reserved (X.690 8.1.3.5)'

// How deep indefinite-length blocks may be nested. Measuring a block measures those in it, a call a level, and a level
// takes two bytes: some thousands of levels used up the call stack, ending the decoding with a RangeError. An Ember+
// tree level takes about four (the element, its children, their collection and the item), so this is well above four
// times the elements' limit (MAX_TREE_DEPTH in the decoder), for a provider that uses the indefinite form throughout.
const MAX_BLOCK_DEPTH = 512

/**
 * An OID's subidentifiers (X.690 8.19.2): each in base 128, the most significant first, bit 8 set on every byte but its
 * last. Read with arithmetic, not 32-bit shifts, which wrapped one of 2^31 or more (to a negative number, or from 2^32
 * to a small one, as if another): exact up to 2^53 - 1, and one above that, which a number can't hold, is refused.
 */
function readArcs(b: Buffer): number[] {
	const arcs: number[] = []
	let value = 0
	for (const byte of b) {
		value = value * 128 + (byte & 0x7f)
		if (value > Number.MAX_SAFE_INTEGER) throw newInvalidAsn1Error('OID arc above 2^53 - 1')
		if ((byte & 0x80) === 0) {
			arcs.push(value)
			value = 0
		}
	}
	return arcs
}

///--- API

export class Reader {
	private _buf: Buffer
	private _size: number
	protected _blocklevel: number
	private _blockInfo: Record<number, number | undefined>
	private _len: number
	private _offset: number

	get length(): number {
		return this._len
	}
	get offset(): number {
		return this._offset
	}
	get remain(): number {
		return this._size - this._offset
	}
	get buffer(): Buffer {
		return this._buf.slice(this._offset)
	}

	constructor(data: Buffer) {
		if (!data || !Buffer.isBuffer(data)) throw new TypeError('data must be a node Buffer')

		this._buf = data
		this._size = data.length
		this._blocklevel = 0
		this._blockInfo = {}
		// These hold the "current" state
		this._len = 0
		this._offset = 0
	}

	/**
	 * Reads a single byte and advances offset; you can pass in `true` to make this
	 * a "peek" operation (i.e., get the byte, but don't advance the offset).
	 *
	 * @param {Boolean} peek true means don't move offset.
	 * @return {Number} the next byte, null if not enough data.
	 */
	readByte(peek?: boolean): number | null {
		if (this._size - this._offset < 1) return null

		const b = at(this._buf, this._offset) & 0xff

		if (!peek) this._offset += 1

		return b
	}

	/**
	 * Measures the indefinite-length block starting at `offset`, its end-of-contents included.
	 * @throws {InvalidAsn1Error} if the block is cut short. The data is a whole message (S101 joins a multi-packet one
	 * before it is decoded), so a block without its end is malformed, not incomplete. It was read as empty, so a message
	 * cut short decoded as an empty tree without errors.
	 */
	readBlock(offset: number): number {
		if (offset === undefined) {
			offset = this._offset
		}
		let currOffset = offset
		let b: number, lenB: number

		const blockInf = this._blockInfo[offset]
		if (blockInf !== undefined) {
			return blockInf
		}

		// Note: this method advances `currOffset`, not `this._offset`, so every bounds
		// check below must be against `currOffset` or a truncated block loops forever.
		while (currOffset < this._size) {
			// A tag takes one byte or more (the multi-byte form), and its length byte follows
			const tag = readTagAt(this._buf, currOffset, this._size)
			if (tag === null || currOffset + tag.size >= this._size) break
			currOffset += tag.size
			b = tag.tag
			lenB = at(this._buf, currOffset++)

			if (b == 0 && lenB == 0) {
				// end of block
				const blockLength = currOffset - offset
				this._blockInfo[offset] = blockLength
				return blockLength
			}
			let len = 0
			if ((lenB & 0x80) == 0x80) {
				lenB &= 0x7f

				if (lenB == 0) {
					if (this._blocklevel + 1 >= MAX_BLOCK_DEPTH) {
						throw newInvalidAsn1Error(
							`indefinite-length blocks nested more than ${MAX_BLOCK_DEPTH} deep at offset ${currOffset}`
						)
					}
					this._blocklevel++
					lenB = this.readBlock(currOffset)
					this._blocklevel--
				} else {
					if (lenB === 0x7f) throw newInvalidAsn1Error(RESERVED_LENGTH)

					if (this._size - currOffset < lenB) {
						throw newInvalidAsn1Error('truncated length in block at offset ' + offset)
					}

					for (let i = 0; i < lenB; i++) {
						len = len * 0x100 + (at(this._buf, currOffset++) & 0xff) // not `<< 8`, as in readLength
					}
					lenB = len
				}
			}
			currOffset += lenB
			if (currOffset > this._size) {
				throw new Error('invalid block at offset ' + offset)
			}
		}

		throw newInvalidAsn1Error('unterminated indefinite-length block at offset ' + offset)
	}

	/** The next tag, without moving on: null when the data ends before the tag does */
	peek(): number | null {
		return readTagAt(this._buf, this._offset, this._size)?.tag ?? null
	}

	/**
	 * Reads a (potentially) variable length off the BER buffer.  This call is
	 * not really meant to be called directly, as callers have to manipulate
	 * the internal buffer afterwards.
	 *
	 * As a result of this call, you can call `Reader.length`, until the
	 * next thing called that does a readLength.
	 *
	 * @return {Number} the amount of offset to advance the buffer.
	 * @throws {InvalidAsn1Error} on bad ASN.1
	 */
	readLength(offset?: number): number | null {
		if (offset === undefined) offset = this._offset

		if (offset >= this._size) return null

		let lenB = at(this._buf, offset++) & 0xff

		if ((lenB & 0x80) === 0x80) {
			lenB &= 0x7f

			if (lenB === 0) {
				this._len = this.readBlock(offset)
			} else {
				if (lenB === 0x7f) throw newInvalidAsn1Error(RESERVED_LENGTH)

				if (this._size - offset < lenB) return null

				this._len = 0
				// Not `<< 8`, which is signed: four length bytes from 0x80000000 up would give a negative length. In
				// doubles, 126 bytes stay finite (under 2^1008); past 2^53 the value is rounded, but is then far more
				// than any data, which the callers refuse.
				for (let i = 0; i < lenB; i++) this._len = this._len * 0x100 + (at(this._buf, offset++) & 0xff)
			}
		} else {
			// Wasn't a variable length
			this._len = lenB
		}

		return offset
	}

	/**
	 * Parses the next sequence in this BER buffer.
	 *
	 * To get the length of the sequence, call `Reader.length`.
	 *
	 * @return {Number} the sequence's tag.
	 */
	readSequence(tag?: number): number | null {
		// The decoders read a sequence's contents until they reach the end its length gives. Were a sequence allowed
		// to end past the data, or a read at the end to return nothing, those loops would never end (#46).
		const next = readTagAt(this._buf, this._offset, this._size)
		if (next === null) {
			throw newInvalidAsn1Error(
				'Expected a sequence at offset ' + this._offset + ': the data ends before its tag does'
			)
		}
		const seq = next.tag
		if (tag !== undefined && tag !== seq)
			throw newInvalidAsn1Error('Expected 0x' + tag.toString(16) + ': got 0x' + seq.toString(16))

		const o = this.readLength(this._offset + next.size) // stored in `length`
		if (o === null) throw newInvalidAsn1Error('Sequence 0x' + seq.toString(16) + ': its length runs past the data')
		if (this._len > this._size - o) {
			throw newInvalidAsn1Error(
				'Sequence 0x' + seq.toString(16) + ' of ' + this._len + ' bytes: only ' + (this._size - o) + ' left'
			)
		}

		this._offset = o
		return seq
	}

	readInt(): number | null {
		return this._readTag(Types.Integer)
	}

	readBoolean(): boolean | null {
		// X.690 8.2 gives a BOOLEAN one contents byte; the first decides, as libember reads it (ber/traits/Boolean.hpp).
		// All of them were read as one integer, so `00 01` was true.
		const contents = this.readStringAsBuffer(Types.Boolean)
		if (contents === null) return null // not enough data, which is not the same as `true`
		return contents.length > 0 && contents[0] !== 0
	}

	readEnumeration(): number | null {
		return this._readTag(Types.Enumeration)
	}

	readStringAsBuffer(tag?: number): Buffer | null {
		if (!tag) tag = Types.OctetString

		const next = readTagAt(this._buf, this._offset, this._size)
		if (next === null) return null
		const b = next.tag

		if (b !== tag) throw newInvalidAsn1Error('Expected 0x' + tag.toString(16) + ': got 0x' + b.toString(16))

		const o = this.readLength(this._offset + next.size) // stored in `length`

		if (o === null) return null

		if (this.length > this._size - o) return null

		let length = this.length
		// indefinite length (after the tag, the length byte 0x80): the contents end with an end-of-contents marker
		if (this._blockInfo[this._offset + next.size + 1] !== undefined) {
			length = length - 2
		}

		this._offset = o

		if (length === 0) return Buffer.alloc(0)

		const str = this._buf.slice(this._offset, this._offset + length)
		this._offset += this.length

		return str
	}

	readString(tag?: number): string | null {
		const buf = this.readStringAsBuffer(tag)
		if (Buffer.isBuffer(buf)) return buf.toString('utf8')
		return null
	}

	readRelativeOID(tag?: number): string | null {
		if (!tag) tag = Types.RelativeOID

		const b = this.readStringAsBuffer(tag)
		if (b === null) return null

		return readArcs(b).join('.')
	}

	readOID(tag?: number): string | null {
		if (!tag) tag = Types.OID

		const b = this.readStringAsBuffer(tag)
		if (b === null) return null

		const values = readArcs(b)

		// The first subidentifier holds the first two arcs, first * 40 + second (X.690 8.19.4). The first arc is 0, 1 or
		// 2, and only under 2 can the second be 40 or more: 2.100 is 180, which dividing by 40 read as 4.20.
		const value = values.shift() ?? 0
		const first = value < 40 ? 0 : value < 80 ? 1 : 2
		values.unshift(value - first * 40)
		values.unshift(first)

		return values.join('.')
	}

	private _readTag(tag: number): number | null {
		assert.ok(tag !== undefined)

		const next = readTagAt(this._buf, this._offset, this._size)
		if (next === null) return null
		const b = next.tag

		if (b !== tag) throw newInvalidAsn1Error('Expected 0x' + tag.toString(16) + ': got 0x' + b.toString(16))

		const o = this.readLength(this._offset + next.size) // stored in `length`
		if (o === null) return null

		if (this.length > 8) throw newInvalidAsn1Error('Integer too long: ' + this.length)

		if (this.length > this._size - o) return null
		this._offset = o

		// No contents: 0, as libember reads it (ber/traits/Integral.hpp). The sign was taken from the next element's byte.
		if (this.length === 0) return 0

		if (this.length > 4) {
			// Five to eight bytes, an Integer64 beyond what the 32-bit arithmetic below holds (ber/traits/Integral.hpp).
			// Exact within ±2^53; a larger value gives the nearest double.
			let value = at(this._buf, this._offset) & 0x80 ? -1n : 0n
			for (let i = 0; i < this.length; i++) value = (value << 8n) | BigInt(at(this._buf, this._offset++))
			return Number(BigInt.asIntN(64, value))
		}

		const fb = at(this._buf, this._offset)
		let value = 0

		let i: number
		for (i = 0; i < this.length; i++) {
			value <<= 8
			value |= at(this._buf, this._offset++) & 0xff
		}

		if ((fb & 0x80) === 0x80 && i !== 4) value -= 1 << (i * 8)

		return value >> 0
	}
}
