// Copyright 2011 Mark Cavage <mcavage@gmail.com> All rights reserved.

import assert from 'assert'

import { newInvalidAsn1Error } from './errors.js'
import { readTagAt } from './tag.js'
import { Types } from './types.js'

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

		const b = this._buf[this._offset] & 0xff

		if (!peek) this._offset += 1

		return b
	}

	readBlock(offset: number): number | null {
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
			lenB = this._buf[currOffset++]

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
					this._blocklevel++
					const nested = this.readBlock(currOffset)
					this._blocklevel--
					if (nested === null) return null
					lenB = nested
				} else {
					if (lenB > 4) throw newInvalidAsn1Error('encoding too long')

					if (this._size - currOffset < lenB) {
						return null
					}

					for (let i = 0; i < lenB; i++) {
						len = len * 0x100 + (this._buf[currOffset++] & 0xff) // not `<< 8`, as in readLength
					}
					lenB = len
				}
			}
			currOffset += lenB
			if (currOffset > this._size) {
				throw new Error('invalid block at offset ' + offset)
			}
		}

		// Ran out of buffer without finding the end-of-block marker
		return null
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

		let lenB = this._buf[offset++] & 0xff
		if (lenB === null) return null

		if ((lenB & 0x80) === 0x80) {
			lenB &= 0x7f

			if (lenB === 0) {
				this._len = this.readBlock(offset) ?? 0
			} else {
				if (lenB > 4) throw newInvalidAsn1Error('encoding too long')

				if (this._size - offset < lenB) return null

				this._len = 0
				// Not `<< 8`, which is signed: four length bytes from 0x80000000 up would give a negative length
				for (let i = 0; i < lenB; i++) this._len = this._len * 0x100 + (this._buf[offset++] & 0xff)
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
		const value = this._readTag(Types.Boolean)
		if (value === null) return null // not enough data, which is not the same as `true`
		return value !== 0
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

		const values = []
		let value = 0

		for (let i = 0; i < b.length; i++) {
			const byte = b[i] & 0xff

			value += byte & 0x7f
			if ((byte & 0x80) == 0x80) {
				value <<= 7
				continue
			}
			values.push(value)
			value = 0
		}

		return values.join('.')
	}

	readOID(tag?: number): string | null {
		if (!tag) tag = Types.OID

		const b = this.readStringAsBuffer(tag)
		if (b === null) return null

		const values: number[] = []
		let value = 0

		for (let i = 0; i < b.length; i++) {
			const byte = b[i] & 0xff

			value <<= 7
			value += byte & 0x7f
			if ((byte & 0x80) === 0) {
				values.push(value)
				value = 0
			}
		}

		value = values.shift() ?? 0
		values.unshift(value % 40)
		values.unshift((value / 40) >> 0)

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

		const fb = this._buf[this._offset]
		let value = 0

		let i: number
		for (i = 0; i < this.length; i++) {
			value <<= 8
			value |= this._buf[this._offset++] & 0xff
		}

		if ((fb & 0x80) === 0x80 && i !== 4) value -= 1 << (i * 8)

		return value >> 0
	}
}
