import { makeTag } from '../ASN1/ber/tag.js'

// ITU-T X.690 (08/2015) 8.1.2. A tag number below 31 gives the one-byte tag, as before; from 31 up, the value the
// reader gives the tag's multi-byte form, which the writer writes in that form
function APPLICATION(x: number): number {
	return makeTag(0x60, x)
}
function CONTEXT(x: number): number {
	return makeTag(0xa0, x)
}
function UNIVERSAL(x: number): number {
	return makeTag(0x00, x)
}

export { APPLICATION, CONTEXT, UNIVERSAL }
