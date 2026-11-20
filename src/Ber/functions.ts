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

/**
 * Whether every arc of a RELATIVE-OID fits in an Integer32. An Ember+ path's arcs are element numbers, and a
 * connection's its sources' numbers, all Integer32 in the Glow DTD: one above 2^31 - 1 names nothing a provider has.
 */
function hasInteger32Arcs(oid: string): boolean {
	return oid.split('.').every((arc) => !(Number(arc) > 0x7fff_ffff))
}

export { APPLICATION, CONTEXT, UNIVERSAL, hasInteger32Arcs }
