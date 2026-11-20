// Copyright 2011 Mark Cavage <mcavage@gmail.com> All rights reserved.

import { Reader } from '../reader.js'
import { Writer } from '../writer.js'

test('write byte', () => {
	const writer = new Writer()

	writer.writeByte(0xc2)
	const ber = writer.buffer

	expect(ber).toBeInstanceOf(Buffer)
	expect(ber).toHaveLength(1)
	expect(ber[0]).toEqual(0xc2) // value wrong
})

test('write 1 byte int', () => {
	const writer = new Writer()

	writer.writeInt(0x7f)
	const ber = writer.buffer

	expect(ber).toBeInstanceOf(Buffer)
	expect(ber.length).toEqual(3) // Wrong length for an int
	expect(ber[0]).toEqual(0x02) // ASN.1 tag wrong
	expect(ber[1]).toEqual(0x01) // length wrong
	expect(ber[2]).toEqual(0x7f) // value wrong (byte 1)
})

test('write an int beyond 32 bits in up to 8 bytes', () => {
	const hex = (i: number) => {
		const writer = new Writer()
		writer.writeInt(i)
		return writer.buffer.toString('hex')
	}

	expect(hex(2 ** 31)).toBe('02050080000000')
	expect(hex(-(2 ** 31) - 1)).toBe('0205ff7fffffff')
	expect(hex(-(2 ** 63))).toBe('02088000000000000000')
	expect(hex(2 ** 32 + 0.5)).toBe('02050100000000') // the fraction dropped
})

test('refuse an int that is not finite or needs more than 64 bits', () => {
	for (const i of [NaN, Infinity, -Infinity, 2 ** 63, -(2 ** 64)]) {
		expect(() => new Writer().writeInt(i)).toThrow(/integer|64-bit/i)
	}
})

test('write 2 byte int', () => {
	const writer = new Writer()

	writer.writeInt(0x7ffe)
	const ber = writer.buffer

	expect(ber).toBeInstanceOf(Buffer)
	expect(ber.length).toEqual(4) // Wrong length for an int
	expect(ber[0]).toEqual(0x02) // ASN.1 tag wrong
	expect(ber[1]).toEqual(0x02) // length wrong
	expect(ber[2]).toEqual(0x7f) // value wrong (byte 1)
	expect(ber[3]).toEqual(0xfe) // value wrong (byte 2)
})

test('write 3 byte int', () => {
	const writer = new Writer()

	writer.writeInt(0x7ffffe)
	const ber = writer.buffer

	expect(ber).toBeInstanceOf(Buffer)
	expect(ber.length).toEqual(5) // Wrong length for an int
	expect(ber[0]).toEqual(0x02) // ASN.1 tag wrong
	expect(ber[1]).toEqual(0x03) // length wrong
	expect(ber[2]).toEqual(0x7f) // value wrong (byte 1)
	expect(ber[3]).toEqual(0xff) // value wrong (byte 2)
	expect(ber[4]).toEqual(0xfe) // value wrong (byte 3)
})

test('write 4 byte int', () => {
	const writer = new Writer()

	writer.writeInt(0x7ffffffe)
	const ber = writer.buffer

	expect(ber).toBeInstanceOf(Buffer)

	expect(ber.length).toEqual(6) // Wrong length for an int
	expect(ber[0]).toEqual(0x02) // ASN.1 tag wrong
	expect(ber[1]).toEqual(0x04) // length wrong
	expect(ber[2]).toEqual(0x7f) // value wrong (byte 1)
	expect(ber[3]).toEqual(0xff) // value wrong (byte 2)
	expect(ber[4]).toEqual(0xff) // value wrong (byte 3)
	expect(ber[5]).toEqual(0xfe) // value wrong (byte 4)
})

test('write 1 byte negative int', () => {
	const writer = new Writer()

	writer.writeInt(-128)
	const ber = writer.buffer

	expect(ber).toBeInstanceOf(Buffer)

	expect(ber.length).toEqual(3) // Wrong length for an int
	expect(ber[0]).toEqual(0x02) // ASN.1 tag wrong
	expect(ber[1]).toEqual(0x01) // length wrong
	expect(ber[2]).toEqual(0x80) // value wrong (byte 1)
})

test('write 2 byte negative int', () => {
	const writer = new Writer()

	writer.writeInt(-22400)
	const ber = writer.buffer

	expect(ber).toBeInstanceOf(Buffer)

	expect(ber.length).toEqual(4) // Wrong length for an int
	expect(ber[0]).toEqual(0x02) // ASN.1 tag wrong
	expect(ber[1]).toEqual(0x02) // length wrong
	expect(ber[2]).toEqual(0xa8) // value wrong (byte 1)
	expect(ber[3]).toEqual(0x80) // value wrong (byte 2)
})

test('write 3 byte negative int', () => {
	const writer = new Writer()

	writer.writeInt(-481653)
	const ber = writer.buffer

	expect(ber).toBeInstanceOf(Buffer)

	expect(ber.length).toEqual(5) // Wrong length for an int
	expect(ber[0]).toEqual(0x02) // ASN.1 tag wrong
	expect(ber[1]).toEqual(0x03) // length wrong
	expect(ber[2]).toEqual(0xf8) // value wrong (byte 1)
	expect(ber[3]).toEqual(0xa6) // value wrong (byte 2)
	expect(ber[4]).toEqual(0x8b) // value wrong (byte 3)
})

test('write 4 byte negative int', () => {
	const writer = new Writer()

	writer.writeInt(-1522904131)
	const ber = writer.buffer

	expect(ber).toBeInstanceOf(Buffer)

	expect(ber.length).toEqual(6) // Wrong length for an int
	expect(ber[0]).toEqual(0x02) // ASN.1 tag wrong
	expect(ber[1]).toEqual(0x04) // length wrong
	expect(ber[2]).toEqual(0xa5) // value wrong (byte 1)
	expect(ber[3]).toEqual(0x3a) // value wrong (byte 2)
	expect(ber[4]).toEqual(0x53) // value wrong (byte 3)
	expect(ber[5]).toEqual(0xbd) // value wrong (byte 4)
})

test('write boolean', () => {
	const writer = new Writer()

	writer.writeBoolean(true)
	writer.writeBoolean(false)
	const ber = writer.buffer

	expect(ber).toBeInstanceOf(Buffer)
	expect(ber.length).toEqual(6) // Wrong length
	expect(ber[0]).toEqual(0x01) // tag wrong
	expect(ber[1]).toEqual(0x01) // length wrong
	expect(ber[2]).toEqual(0xff) // value wrong
	expect(ber[3]).toEqual(0x01) // tag wrong
	expect(ber[4]).toEqual(0x01) // length wrong
	expect(ber[5]).toEqual(0x00) // value wrong
})

test('write string', () => {
	const writer = new Writer()
	writer.writeString('hello world')
	const ber = writer.buffer

	expect(ber).toBeInstanceOf(Buffer)
	expect(ber.length).toEqual(13) // wrong length
	expect(ber[0]).toEqual(0x04) // wrong tag
	expect(ber[1]).toEqual(11) // wrong length
	expect(ber.slice(2).toString('utf8')).toEqual('hello world') // wrong value
})

test('write buffer', () => {
	const writer = new Writer()
	// write some stuff to start with
	writer.writeString('hello world')
	const buf = Buffer.from([0x04, 0x0b, 0x30, 0x09, 0x02, 0x01, 0x0f, 0x01, 0x01, 0xff, 0x01, 0x01, 0xff])
	writer.writeBuffer(buf.slice(2, buf.length), 0x04)
	const ber = writer.buffer

	expect(ber).toBeInstanceOf(Buffer)
	expect(ber.length).toEqual(26) // wrong length
	expect(ber[0]).toEqual(0x04) // wrong tag
	expect(ber[1]).toEqual(11) // wrong length
	expect(ber.slice(2, 13).toString('utf8')).toEqual('hello world') // wrong value
	expect(ber[13]).toEqual(buf[0]) // wrong tag
	expect(ber[14]).toEqual(buf[1]) // wrong length
	for (let i = 13, j = 0; i < ber.length && j < buf.length; i++, j++) {
		expect(ber[i]).toEqual(buf[j]) // buffer contents not identical
	}
})

test('write string array', () => {
	const writer = new Writer()
	writer.writeStringArray(['hello world', 'fubar!'])
	const ber = writer.buffer

	expect(ber).toBeInstanceOf(Buffer)

	expect(ber.length).toEqual(21) // wrong length
	expect(ber[0]).toEqual(0x04) // wrong tag
	expect(ber[1]).toEqual(11) // wrong length
	expect(ber.slice(2, 13).toString('utf8')).toEqual('hello world') // wrong value

	expect(ber[13]).toEqual(0x04) // wrong tag
	expect(ber[14]).toEqual(6) // wrong length
	expect(ber.slice(15).toString('utf8')).toEqual('fubar!') // wrong value
})

test('resize internal buffer', () => {
	const writer = new Writer({ size: 2 })
	writer.writeString('hello world')
	const ber = writer.buffer

	expect(ber).toBeInstanceOf(Buffer)
	expect(ber.length).toEqual(13) // wrong length
	expect(ber[0]).toEqual(0x04) // wrong tag
	expect(ber[1]).toEqual(11) // wrong length
	expect(ber.slice(2).toString('utf8')).toEqual('hello world') // wrong value
})

test('sequence', () => {
	const writer = new Writer({ size: 25 })
	writer.startSequence()
	writer.writeString('hello world')
	writer.endSequence()
	const ber = writer.buffer

	expect(ber).toBeInstanceOf(Buffer)
	expect(ber.length).toEqual(15) // wrong length
	expect(ber[0]).toEqual(0x30) // wrong tag
	expect(ber[1]).toEqual(13) // wrong length
	expect(ber[2]).toEqual(0x04) // wrong tag
	expect(ber[3]).toEqual(11) // wrong length
	expect(ber.slice(4).toString('utf8')).toEqual('hello world') // wrong value
})

test('nested sequence', () => {
	const writer = new Writer({ size: 25 })
	writer.startSequence()
	writer.writeString('hello world')
	writer.startSequence()
	writer.writeString('hello world')
	writer.endSequence()
	writer.endSequence()
	const ber = writer.buffer

	expect(ber).toBeInstanceOf(Buffer)
	expect(ber.length).toEqual(30) // wrong length
	expect(ber[0]).toEqual(0x30) // wrong tag
	expect(ber[1]).toEqual(28) // wrong length
	expect(ber[2]).toEqual(0x04) // wrong tag
	expect(ber[3]).toEqual(11) // wrong length
	expect(ber.slice(4, 15).toString('utf8')).toEqual('hello world') // wrong value
	expect(ber[15]).toEqual(0x30) // wrong tag
	expect(ber[16]).toEqual(13) // wrong length
	expect(ber[17]).toEqual(0x04) // wrong tag
	expect(ber[18]).toEqual(11) // wrong length
	expect(ber.slice(19, 30).toString('utf8')).toEqual('hello world') // wrong value
})

test('LDAP bind message', () => {
	const dn = 'cn=foo,ou=unit,o=test'
	const writer = new Writer()
	writer.startSequence()
	writer.writeInt(3) // msgid = 3
	writer.startSequence(0x60) // ldap bind
	writer.writeInt(3) // ldap v3
	writer.writeString(dn)
	writer.writeByte(0x80)
	writer.writeByte(0x00)
	writer.endSequence()
	writer.endSequence()
	const ber = writer.buffer

	expect(ber).toBeInstanceOf(Buffer)
	expect(ber.length).toEqual(35) // wrong length (buffer)
	expect(ber[0]).toEqual(0x30) // wrong tag
	expect(ber[1]).toEqual(33) // wrong length
	expect(ber[2]).toEqual(0x02) // wrong tag
	expect(ber[3]).toEqual(1) // wrong length
	expect(ber[4]).toEqual(0x03) // wrong value
	expect(ber[5]).toEqual(0x60) // wrong tag
	expect(ber[6]).toEqual(28) // wrong length
	expect(ber[7]).toEqual(0x02) // wrong tag
	expect(ber[8]).toEqual(1) // wrong length
	expect(ber[9]).toEqual(0x03) // wrong value
	expect(ber[10]).toEqual(0x04) // wrong tag
	expect(ber[11]).toEqual(dn.length) // wrong length
	expect(ber.slice(12, 33).toString('utf8')).toEqual(dn) // wrong value
	expect(ber[33]).toEqual(0x80) // wrong tag
	expect(ber[34]).toEqual(0x00) // wrong len
})

test('Write OID', () => {
	const oid = '1.2.840.113549.1.1.1'
	const writer = new Writer()
	writer.writeOID(oid)

	expect(writer.buffer).toEqual(Buffer.from([0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01]))
})

// The first two arcs are one subidentifier, in base 128 like the others: from 2.48 it takes more than one byte, and
// was written as a single byte cut short
test.each([
	{ oid: '2.39.3', bytes: [0x77, 0x03] },
	{ oid: '2.48.3', bytes: [0x81, 0x00, 0x03] },
	{ oid: '2.100.3', bytes: [0x81, 0x34, 0x03] },
	{ oid: '2.999.3', bytes: [0x88, 0x37, 0x03] },
])('Write OID $oid', ({ oid, bytes }) => {
	const writer = new Writer()
	writer.writeOID(oid)

	expect(writer.buffer).toEqual(Buffer.from([0x06, bytes.length, ...bytes]))
	expect(new Reader(writer.buffer).readOID()).toEqual(oid)
})

// The first arc is 0, 1 or 2, and under 0 or 1 the second is below 40: 1.40 would read back as 2.0
test.each(['3.0', '0.40', '1.40.3'])('Write OID refuses first arcs %s', (oid) => {
	expect(() => new Writer().writeOID(oid)).toThrow('argument is not a valid OID string')
})

// The first byte holds the first two arcs: a single arc was written as NaN
test('Write OID refuses a single arc', () => {
	expect(() => new Writer().writeOID('1')).toThrow('argument is not a valid OID string')
})

// A size or growth factor of 0 means the default, as in the asn1 library, and the buffer grows by at least what is
// needed: with a growth factor below 1 it could grow to less than had been written, losing the rest
test.each([{ growthFactor: 0 }, { growthFactor: 0.5 }, { growthFactor: 1 }, { size: 0 }, { size: 1 }])(
	'grows correctly with options %j',
	(options) => {
		// the first string fills most of the default 1024 bytes, so the second grows the buffer from nearly full
		const first = 'a'.repeat(1000)
		const second = 'x'.repeat(3000)
		const writer = new Writer(options)
		writer.writeString(first)
		writer.writeString(second)

		const ber = writer.buffer
		expect(ber.length).toEqual(4 + first.length + 4 + second.length)
		expect(ber.subarray(0, 4)).toEqual(Buffer.from([0x04, 0x82, 0x03, 0xe8]))
		expect(ber.subarray(4, 1004).toString('utf8')).toEqual(first)
		expect(ber.subarray(1004, 1008)).toEqual(Buffer.from([0x04, 0x82, 0x0b, 0xb8]))
		expect(ber.subarray(1008).toString('utf8')).toEqual(second)
	}
)

// endSequence reserves 3 bytes for the length, and contents of 0x10000 bytes or more need 4 (83 xx xx xx), so they
// are moved on by one. When the buffer ended where the contents did, the move lost their last byte. Growth that
// fits a large write exactly leaves it so, as it now does with the default options.
test.each([{}, { growthFactor: 1 }, { size: 0x10009 }])(
	'grows before moving a sequence into the 0x83 length form, options %j',
	(options) => {
		const content = Buffer.alloc(0x10000, 0x61)
		content[content.length - 1] = 0x7a
		const writer = new Writer(options)
		writer.startSequence(0x30)
		writer.writeBuffer(content, 0x04)
		writer.endSequence()

		const ber = writer.buffer
		const inner = 1 + 4 + content.length
		expect(ber.length).toEqual(1 + 4 + inner)
		expect(ber.subarray(0, 5)).toEqual(Buffer.from([0x30, 0x83, inner >> 16, (inner >> 8) & 0xff, inner & 0xff]))
		expect(ber.subarray(5, 10)).toEqual(Buffer.from([0x04, 0x83, 0x01, 0x00, 0x00]))
		expect(ber[ber.length - 1]).toEqual(0x7a)
	}
)

test('grows before moving nested sequences into the 0x83 length form', () => {
	const content = Buffer.alloc(0x10000, 0x61)
	content[content.length - 1] = 0x7a
	const writer = new Writer()
	writer.startSequence(0x30)
	writer.startSequence(0x31)
	writer.writeBuffer(content, 0x04)
	writer.endSequence()
	writer.endSequence()

	const ber = writer.buffer
	expect(ber.length).toEqual(1 + 4 + 1 + 4 + 1 + 4 + content.length)
	expect(ber.subarray(0, 2)).toEqual(Buffer.from([0x30, 0x83]))
	expect(ber.subarray(5, 7)).toEqual(Buffer.from([0x31, 0x83]))
	expect(ber[ber.length - 1]).toEqual(0x7a)
})

test('write empty buffer', () => {
	const writer = new Writer()
	writer.writeBuffer(Buffer.alloc(0), 0x04)

	const ber = writer.buffer
	expect(ber).toHaveLength(2)
	expect(ber[0]).toEqual(0x04) // wrong tag
	expect(ber[1]).toEqual(0x00) // wrong length
})

test('write relative OID', () => {
	const writer = new Writer()
	writer.writeRelativeOID('1.2.3', 0x0d)

	expect(writer.buffer).toEqual(Buffer.from([0x0d, 0x03, 0x01, 0x02, 0x03]))
})

// Each arc in base 128, the most significant first, bit 8 set on every byte but its last
test('write relative OID with arcs of more than one byte', () => {
	const writer = new Writer()
	writer.writeRelativeOID('0.127.128.300.16384', 0x0d)

	expect(writer.buffer).toEqual(Buffer.from([0x0d, 0x09, 0x00, 0x7f, 0x81, 0x00, 0x82, 0x2c, 0x81, 0x80, 0x00]))
})

test('write empty relative OID', () => {
	const writer = new Writer()
	writer.writeRelativeOID('', 0x0d)

	expect(writer.buffer).toEqual(Buffer.from([0x0d, 0x00]))
})

test('write relative OID with empty arc', () => {
	expect(() => new Writer().writeRelativeOID('1.2.', 0x0d)).toThrow('argument is not a valid OID string')
	expect(() => new Writer().writeRelativeOID('.1.2', 0x0d)).toThrow('argument is not a valid OID string')
	expect(() => new Writer().writeRelativeOID('1..2', 0x0d)).toThrow('argument is not a valid OID string')
})
