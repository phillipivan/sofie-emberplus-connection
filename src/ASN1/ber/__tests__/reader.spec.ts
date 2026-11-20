// Copyright 2011 Mark Cavage <mcavage@gmail.com> All rights reserved.

import { Reader } from '../reader.js'

test('read byte', () => {
	const reader = new Reader(Buffer.from([0xde]))
	expect(reader).toBeTruthy()
	expect(reader.readByte()).toEqual(0xde) // wrong value
})

test('read 1 byte int', () => {
	const reader = new Reader(Buffer.from([0x02, 0x01, 0x03]))
	expect(reader).toBeTruthy()
	expect(reader.readInt()).toEqual(0x03) // wrong value
	expect(reader.length).toEqual(0x01) // wrong length
})

test('read 2 byte int', () => {
	const reader = new Reader(Buffer.from([0x02, 0x02, 0x7e, 0xde]))
	expect(reader).toBeTruthy()
	expect(reader.readInt()).toEqual(0x7ede) // wrong value
	expect(reader.length).toEqual(0x02) // wrong length
})

test('read 3 byte int', () => {
	const reader = new Reader(Buffer.from([0x02, 0x03, 0x7e, 0xde, 0x03]))
	expect(reader).toBeTruthy()
	expect(reader.readInt()).toEqual(0x7ede03) // wrong value
	expect(reader.length).toEqual(0x03) // wrong length
})

test('read 4 byte int', () => {
	const reader = new Reader(Buffer.from([0x02, 0x04, 0x7e, 0xde, 0x03, 0x01]))
	expect(reader).toBeTruthy()
	expect(reader.readInt()).toEqual(0x7ede0301) // wrong value
	expect(reader.length).toEqual(0x04) // wrong length
})

test('read 1 byte negative int', () => {
	const reader = new Reader(Buffer.from([0x02, 0x01, 0xdc]))
	expect(reader).toBeTruthy()
	expect(reader.readInt()).toEqual(-36) // wrong value
	expect(reader.length).toEqual(0x01) // wrong length
})

test('read 2 byte negative int', () => {
	const reader = new Reader(Buffer.from([0x02, 0x02, 0xc0, 0x4e]))
	expect(reader).toBeTruthy()
	expect(reader.readInt()).toEqual(-16306) // wrong value
	expect(reader.length).toEqual(0x02) // wrong length
})

test('read 3 byte negative int', () => {
	const reader = new Reader(Buffer.from([0x02, 0x03, 0xff, 0x00, 0x19]))
	expect(reader).toBeTruthy()
	expect(reader.readInt()).toEqual(-65511) // wrong value
	expect(reader.length).toEqual(0x03) // wrong length
})

test('read 4 byte negative int', () => {
	const reader = new Reader(Buffer.from([0x02, 0x04, 0x91, 0x7c, 0x22, 0x1f]))
	expect(reader).toBeTruthy()
	expect(reader.readInt()).toEqual(-1854135777) // wrong value
	expect(reader.length).toEqual(0x04) // wrong length
})

test('read boolean true', () => {
	const reader = new Reader(Buffer.from([0x01, 0x01, 0xff]))
	expect(reader).toBeTruthy()
	expect(reader.readBoolean()).toEqual(true) // wrong value
	expect(reader.length).toEqual(0x01) // wrong length
})

test('read boolean false', () => {
	const reader = new Reader(Buffer.from([0x01, 0x01, 0x00]))
	expect(reader).toBeTruthy()
	expect(reader.readBoolean()).toEqual(false) // wrong value
	expect(reader.length).toEqual(0x01) // wrong length
})

test('read enumeration', () => {
	const reader = new Reader(Buffer.from([0x0a, 0x01, 0x20]))
	expect(reader).toBeTruthy()
	expect(reader.readEnumeration()).toEqual(0x20) // wrong value
	expect(reader.length).toEqual(0x01) // wrong length
})

test('read string', () => {
	const dn = 'cn=foo,ou=unit,o=test'
	const buf = Buffer.alloc(dn.length + 2)
	buf[0] = 0x04
	buf[1] = Buffer.byteLength(dn)
	buf.write(dn, 2)
	const reader = new Reader(buf)
	expect(reader).toBeTruthy()
	expect(reader.readString()).toEqual(dn) // wrong value
	expect(reader.length).toEqual(dn.length) // wrong length
})

test('read sequence', () => {
	const reader = new Reader(Buffer.from([0x30, 0x03, 0x01, 0x01, 0xff]))
	expect(reader).toBeTruthy()
	expect(reader.readSequence()).toEqual(0x30) // wrong value
	expect(reader.length).toEqual(0x03) // wrong length
	expect(reader.readBoolean()).toEqual(true) // wrong value
	expect(reader.length).toEqual(0x01) // wrong length
})

test('anonymous LDAPv3 bind', () => {
	const BIND = Buffer.alloc(14)
	BIND[0] = 0x30 // Sequence
	BIND[1] = 12 // len
	BIND[2] = 0x02 // ASN.1 Integer
	BIND[3] = 1 // len
	BIND[4] = 0x04 // msgid (make up 4)
	BIND[5] = 0x60 // Bind Request
	BIND[6] = 7 // len
	BIND[7] = 0x02 // ASN.1 Integer
	BIND[8] = 1 // len
	BIND[9] = 0x03 // v3
	BIND[10] = 0x04 // String (bind dn)
	BIND[11] = 0 // len
	BIND[12] = 0x80 // ContextSpecific (choice)
	BIND[13] = 0 // simple bind

	// Start testing ^^
	const ber = new Reader(BIND)
	expect(ber.readSequence()).toBe(48) // Not an ASN.1 Sequence
	expect(ber.length).toBe(12) // Message length should be 12
	expect(ber.readInt()).toBe(4) // Message id should have been 4
	expect(ber.readSequence()).toBe(96) // Bind Request should have been 96
	expect(ber.length).toBe(7) // Bind length should have been 7
	expect(ber.readInt()).toBe(3) // LDAP version should have been 3
	expect(ber.readString()).toBe('') // Bind DN should have been empty
	expect(ber.length).toBe(0) // string length should have been 0
	expect(ber.readByte()).toBe(0x80) // Should have been ContextSpecific (choice)
	expect(ber.readByte()).toBe(0) // Should have been simple bind
	expect(ber.readByte()).toBeNull() // Should be out of data
})

test('long string', () => {
	const buf = Buffer.alloc(256)
	const s =
		'2;649;CN=Red Hat CS 71GA Demo,O=Red Hat CS 71GA Demo,C=US;' +
		'CN=RHCS Agent - admin01,UID=admin01,O=redhat,C=US [1] This is ' +
		"Teena Vradmin's description."
	buf[0] = 0x04
	buf[1] = 0x81
	buf[2] = 0x94
	buf.write(s, 3)
	const ber = new Reader(buf.slice(0, 3 + s.length))
	expect(ber.readString()).toBe(s)
})

test('indefinite length sequence', () => {
	// indefinite length, containing a 1 byte int, terminated by 0x00 0x00
	const reader = new Reader(Buffer.from([0x60, 0x80, 0x02, 0x01, 0x05, 0x00, 0x00]))

	expect(reader.readSequence(0x60)).toEqual(0x60)
	expect(reader.length).toEqual(5)
	expect(reader.offset).toEqual(2)
	expect(reader.readInt()).toEqual(5)
})

test('nested indefinite length sequences', () => {
	const reader = new Reader(Buffer.from([0x60, 0x80, 0x61, 0x80, 0x02, 0x01, 0x07, 0x00, 0x00, 0x00, 0x00]))

	expect(reader.readSequence(0x60)).toEqual(0x60)
	expect(reader.length).toEqual(9)
	expect(reader.readSequence(0x61)).toEqual(0x61)
	expect(reader.length).toEqual(5)
	expect(reader.readInt()).toEqual(7)
})

// X.690 8.1.3.5: 1 to 126 length bytes, and the first length byte must not be 0xFF (#57)
describe('long-form lengths', () => {
	test('refuse the reserved first length byte 0xFF', () => {
		const lengthBytes = [0xff, ...Buffer.alloc(127)]

		expect(() => new Reader(Buffer.from([0x30, ...lengthBytes])).readSequence()).toThrow(/0xFF is reserved/)
		// and inside a container of indefinite length, which is scanned for its end
		expect(() => new Reader(Buffer.from([0x30, 0x80, 0x04, ...lengthBytes, 0x00, 0x00])).readSequence()).toThrow(
			/0xFF is reserved/
		)
	})

	test('refuse a length past the data, however many bytes it takes', () => {
		for (const length of [
			[0x85, 0x01, 0, 0, 0, 0],
			[0x89, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff],
		]) {
			expect(() => new Reader(Buffer.from([0x30, ...length, 0x02, 0x01, 0x07])).readSequence()).toThrow(
				/only \d+ left/
			)
			expect(new Reader(Buffer.from([0x04, ...length, 0x61])).readStringAsBuffer(0x04)).toBeNull()
		}
	})

	test('refuse a length past the data inside a container of indefinite length', () => {
		const reader = new Reader(Buffer.from([0x30, 0x80, 0x04, 0x89, 0xff, 0, 0, 0, 0, 0, 0, 0, 0, 0x61, 0x00, 0x00]))

		expect(() => reader.readSequence()).toThrow(/invalid block/)
	})
})

// The data is a whole message (S101 joins a multi-packet one first), so a block without its end is malformed, not
// incomplete. It used to loop forever, and then was read as empty.
test('truncated indefinite length block throws', () => {
	// no 0x00 0x00 terminator
	const reader = new Reader(Buffer.from([0x60, 0x80, 0x01, 0x01, 0xff, 0x00]))

	expect(() => reader.readBlock(2)).toThrow(/unterminated indefinite-length block/)
	expect(() => reader.readSequence(0x60)).toThrow(/unterminated indefinite-length block/)
})

test('truncated nested indefinite length block throws', () => {
	// the inner block's end is there, the outer one's isn't
	const reader = new Reader(Buffer.from([0x60, 0x80, 0x61, 0x80, 0x01, 0x01, 0xff, 0x00, 0x00]))

	expect(() => reader.readSequence(0x60)).toThrow(/unterminated indefinite-length block at offset 2/)
})

test('truncated long-form length inside indefinite length block throws', () => {
	// the inner element's length takes 2 bytes, but only 1 is left
	const reader = new Reader(Buffer.from([0x60, 0x80, 0x04, 0x82, 0x01]))

	expect(() => reader.readSequence(0x60)).toThrow(/truncated length in block/)
})

// Nesting indefinite-length blocks takes two bytes a level, and measuring them a call a level: some thousands of levels
// used up the call stack, ending the decoding with a RangeError
describe('indefinite-length nesting', () => {
	const nested = (levels: number) => {
		const b = Buffer.alloc(4 * levels)
		for (let i = 0; i < levels; i++) b.set([0x30, 0x80], 2 * i) // and 00 00 for each end
		return b
	}

	test('is read 512 levels deep', () => {
		expect(new Reader(nested(512)).readSequence()).toBe(0x30)
	})

	test.each([513, 100000])('is refused %d levels deep', (levels) => {
		expect(() => new Reader(nested(levels)).readSequence()).toThrow(
			/indefinite-length blocks nested more than 512 deep/
		)
	})
})

test('truncated indefinite length block does not hang at any length', () => {
	const full = Buffer.from([0x60, 0x80, 0x61, 0x80, 0x02, 0x01, 0x07, 0x00, 0x00, 0x00, 0x00])

	for (let len = 0; len < full.length; len++) {
		const reader = new Reader(full.slice(0, len))
		// throwing on malformed input is fine, hanging is not
		expect(() => {
			reader.readSequence()
			reader.readSequence()
			reader.readInt()
		}).not.toThrow(RangeError)
	}
})

test('read boolean with no value', () => {
	// a truncated boolean must not be reported as `true`
	expect(new Reader(Buffer.from([0x01])).readBoolean()).toBeNull()
	expect(new Reader(Buffer.from([0x01, 0x01])).readBoolean()).toBeNull()
	expect(new Reader(Buffer.from([0x01, 0x01, 0x00])).readBoolean()).toEqual(false)
	expect(new Reader(Buffer.from([0x01, 0x01, 0xff])).readBoolean()).toEqual(true)
})

// The first subidentifier holds the first two arcs, first * 40 + second: the first arc is 0 below 40, 1 below 80 and 2
// from there, its second arc then 40 or more (dividing by 40 read 2.100.3 as 4.20.3)
test.each([
	{ bytes: [0x00, 0x03], oid: '0.0.3' },
	{ bytes: [0x27, 0x03], oid: '0.39.3' },
	{ bytes: [0x28, 0x03], oid: '1.0.3' },
	{ bytes: [0x4f, 0x03], oid: '1.39.3' },
	{ bytes: [0x50, 0x03], oid: '2.0.3' },
	{ bytes: [0x77, 0x03], oid: '2.39.3' },
	{ bytes: [0x78, 0x03], oid: '2.40.3' },
	{ bytes: [0x81, 0x34, 0x03], oid: '2.100.3' },
	{ bytes: [0x88, 0x37, 0x03], oid: '2.999.3' },
])('read OID $oid', ({ bytes, oid }) => {
	const reader = new Reader(Buffer.from([0x06, bytes.length, ...bytes]))
	expect(reader.readOID()).toEqual(oid)
})

// Arcs are read with arithmetic, exact up to 2^53 - 1: 32-bit shifts read 2^31 as a negative number and 2^32 + 5 as 5
test.each([
	{ bytes: [0x01, 0x88, 0x80, 0x80, 0x80, 0x00], oid: '1.2147483648' },
	{ bytes: [0x01, 0x90, 0x80, 0x80, 0x80, 0x05], oid: '1.4294967301' },
	{ bytes: [0x01, 0x8f, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0x7f], oid: '1.9007199254740991' },
])('read relative OID $oid', ({ bytes, oid }) => {
	const reader = new Reader(Buffer.from([0x0d, bytes.length, ...bytes]))
	expect(reader.readRelativeOID()).toEqual(oid)
})

// The first subidentifier of 2.(2^32 + 5) is 2^32 + 85
test('read OID with an arc above 32 bits', () => {
	const reader = new Reader(Buffer.from([0x06, 0x06, 0x90, 0x80, 0x80, 0x80, 0x55, 0x03]))
	expect(reader.readOID()).toEqual('2.4294967301.3')
})

// One of 2^53 or more, which a number can't hold exactly, is refused rather than read as another
test.each([
	{ name: 'relative OID', read: (reader: Reader) => reader.readRelativeOID(), tag: 0x0d },
	{ name: 'OID', read: (reader: Reader) => reader.readOID(), tag: 0x06 },
])('read $name refuses an arc of 2^53', ({ read, tag }) => {
	const bytes = [0x01, 0x90, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x00]
	expect(() => read(new Reader(Buffer.from([tag, bytes.length, ...bytes])))).toThrow('OID arc above 2^53 - 1')
})
