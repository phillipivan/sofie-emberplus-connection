import { at } from '../../lib/at.js'
import { newInvalidAsn1Error } from './errors.js'

// X.690 8.1.2: a tag is a class (bits 8-7 of its first byte), a constructed bit (bit 6) and a number. A number below
// 31 fits in the first byte's five low bits. From 31 up those bits are all set and the number follows in base 128,
// bit 8 set on every byte but the last. The Ember+ documentation lets an encoder use that form for any number, "with
// the second byte containing the actual tag number" (Implementation recommendations › Encoder), and gives a tag's
// number "up to four bytes" (The tag format).

/** The largest tag number this library reads: four bytes */
const MAX_TAG_NUMBER = 0xffffffff

/**
 * A tag as the one number the decoders compare it by. For a number below 31 it is the single byte the tag takes in
 * the short form, whichever form it came in: `bf 02` and `a2` are both context tag 2, constructed. For a larger
 * number it is the first byte (its five low bits set) plus the number times 0x100, so it can't be taken for a single
 * byte.
 */
export function makeTag(preamble: number, number: number): number {
	const classAndConstructed = preamble & 0xe0
	return number < 0x1f ? classAndConstructed | number : number * 0x100 + (classAndConstructed | 0x1f)
}

/** The tag at `offset` and how many bytes it takes; null when the data ends before the tag does */
export function readTagAt(buf: Buffer, offset: number, end = buf.length): { tag: number; size: number } | null {
	if (offset >= end) return null
	const first = at(buf, offset)
	if ((first & 0x1f) !== 0x1f) return { tag: first, size: 1 }

	let number = 0
	let next = offset + 1
	for (;;) {
		if (next >= end) return null
		const b = at(buf, next++)
		number = number * 0x80 + (b & 0x7f)
		if (number > MAX_TAG_NUMBER)
			throw newInvalidAsn1Error('The tag number at offset ' + offset + ' takes more than 32 bits')
		if ((b & 0x80) === 0) return { tag: makeTag(first, number), size: next - offset }
	}
}
