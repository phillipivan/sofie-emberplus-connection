// Rewrites BER in the forms the Ember+ documentation lets an encoder choose (Implementation recommendations ›
// Encoder), for an encoder that writes its tags and lengths in a fixed number of bytes:
// "a fixed number of octets can also be used to encode tags. E.g. if the DTD defines a maximum tag number of 127 (...),
// an encoder can always use two bytes to encode a tag – with the second byte containing the actual tag number and the
// five least significant bits of the first byte all set to '1'." and "The encoder is free to use the definite long
// length form [X.690 8.1.3.5] even for lengths smaller than 128."

import { at } from '../../../lib/at.js'

interface Tlv {
	/** The first tag byte's class and constructed bits */
	preamble: number
	number: number
	contents: Buffer
	indefinite: boolean
	end: number
}

function readTlv(buf: Buffer, offset: number): Tlv {
	const lead = at(buf, offset++)
	let number = lead & 0x1f
	if (number === 0x1f) {
		number = 0
		let b: number
		do {
			b = at(buf, offset++)
			number = number * 0x80 + (b & 0x7f)
		} while (b & 0x80)
	}
	let length = at(buf, offset++)
	if (length === 0x80) {
		// indefinite: the contents run to the end-of-contents marker that closes this element
		const start = offset
		while (!(buf[offset] === 0 && buf[offset + 1] === 0)) offset = readTlv(buf, offset).end
		return {
			preamble: lead & 0xe0,
			number,
			contents: buf.subarray(start, offset),
			indefinite: true,
			end: offset + 2,
		}
	}
	if (length & 0x80) {
		const lengthBytes = length & 0x7f
		length = 0
		for (let i = 0; i < lengthBytes; i++) length = length * 0x100 + at(buf, offset++)
	}
	return {
		preamble: lead & 0xe0,
		number,
		contents: buf.subarray(offset, offset + length),
		indefinite: false,
		end: offset + length,
	}
}

/**
 * The same BER with every tag in two bytes (numbers up to 127), and with `longLengths` every definite length in the
 * long form of four bytes. Indefinite lengths stay indefinite.
 */
export function withTwoByteTags(buf: Buffer, { longLengths = false } = {}): Buffer {
	const out: Buffer[] = []
	let offset = 0
	while (offset < buf.length) {
		const tlv = readTlv(buf, offset)
		offset = tlv.end
		if (tlv.number > 0x7f) throw new Error(`tag number ${tlv.number} needs more than two bytes`)
		const tag = Buffer.from([tlv.preamble | 0x1f, tlv.number])
		const constructed = (tlv.preamble & 0x20) !== 0
		const contents = constructed ? withTwoByteTags(tlv.contents, { longLengths }) : tlv.contents
		if (tlv.indefinite) {
			out.push(tag, Buffer.from([0x80]), contents, Buffer.from([0, 0]))
		} else {
			out.push(tag, encodeLength(contents.length, longLengths), contents)
		}
	}
	return Buffer.concat(out)
}

function encodeLength(length: number, long: boolean): Buffer {
	if (long) {
		const bytes = Buffer.alloc(5)
		bytes[0] = 0x84
		bytes.writeUInt32BE(length, 1)
		return bytes
	}
	if (length < 0x80) return Buffer.from([length])
	const octets: number[] = []
	for (let rest = length; rest > 0; rest = Math.floor(rest / 0x100)) octets.unshift(rest & 0xff)
	return Buffer.from([0x80 | octets.length, ...octets])
}
