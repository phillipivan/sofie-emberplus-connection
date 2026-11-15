import { berEncode } from '../../encodings/ber/index.js'
import { GetDirectoryImpl } from '../../model/Command.js'
import { EmberNodeImpl, NumberedTreeNodeImpl, ParameterImpl, ParameterType } from '../../model/index.js'
import { RootType } from '../../types/types.js'
import S101Codec from '../S101Codec.js'

// The codec compared with Lawo's reference implementations (github.com/Lawo/ember-plus, at 6bc294e): libs101
// (libs101/Headers/s101), the S101 coder libember's users take, and libember_slim's framing (emberframing.c, glowrx.c,
// glowtx.c). The helpers below port libs101's StreamEncoder and StreamDecoder, so the codec's frames are compared with
// theirs rather than with bytes worked out by hand.
//
// A test marked `failing` states libember's behaviour where the codec differs from it: it passes while the difference
// remains, and fails once the codec behaves as libember does, to be made an ordinary test.

const BOF = 0xfe
const EOF = 0xff
const CE = 0xfd
const XOR = 0x20
const INVALID = 0xf8

// util/Crc16.hpp lists this table: CRC-16/CCITT, reflected (polynomial 0x8408)
const CRC_TABLE = Array.from({ length: 256 }, (_, i) => {
	let c = i
	for (let bit = 0; bit < 8; bit++) c = c & 1 ? (c >> 1) ^ 0x8408 : c >> 1
	return c
})
const crcAdd = (crc: number, byte: number) => 0xffff & ((crc >> 8) ^ CRC_TABLE[(crc ^ byte) & 0xff])

/** StreamEncoder.hpp: BOF, the message with every byte from 0xF8 up escaped, the inverted CRC (low byte first), EOF */
function libs101Encode(message: number[] | Buffer): Buffer {
	const out = [BOF]
	const append = (b: number) => (b >= INVALID ? out.push(CE, b ^ XOR) : out.push(b))
	let crc = 0xffff
	for (const b of message) {
		crc = crcAdd(crc, b)
		append(b)
	}
	crc = ~crc & 0xffff
	append(crc & 0xff)
	append(crc >> 8)
	out.push(EOF)
	return Buffer.from(out)
}

/** StreamDecoder.hpp, escaping frames: the messages of the frames with a good CRC, without the CRC */
function libs101Decode(bytes: Buffer): Buffer[] {
	const messages: Buffer[] = []
	let inFrame = false
	let escape = false
	let message: number[] = []
	let crc = 0xffff
	for (let byte of bytes) {
		if (!inFrame) {
			if (byte === BOF) [inFrame, escape, message, crc] = [true, false, [], 0xffff]
			continue
		}
		if (byte === BOF) {
			;[escape, message, crc] = [false, [], 0xffff]
		} else if (byte === EOF) {
			if (crc === 0xf0b8 && message.length > 1) messages.push(Buffer.from(message.slice(0, -2)))
			inFrame = false
		} else if (byte === CE) {
			escape = true
		} else {
			if (escape) {
				escape = false
				byte ^= XOR
			}
			message.push(byte)
			crc = crcAdd(crc, byte)
		}
	}
	return messages
}

// glowtx.c: libember_slim's EmBER packet header. Slot 0, message 0x0E (EmBER), command 0 (EmBER packet), version 1,
// the flags, DTD 1 (Glow), and two app bytes: GLOW_SCHEMA_VERSION 0x0232 (Glow DTD 2.50), low byte first.
const header = (flags: number, { slot = 0x00, dtd = 0x01 } = {}) => [slot, 0x0e, 0x00, 0x01, flags, dtd, 2, 0x32, 0x02]

/** An Ember message: a GetDirectory on the root, as a consumer sends it */
const payload = () => berEncode([new NumberedTreeNodeImpl(0, new GetDirectoryImpl())], RootType.Elements)

/** A message holding every byte from 0xF8 up, which an encoder escapes, among others */
const awkwardPayload = () =>
	berEncode(
		[
			new NumberedTreeNodeImpl(
				1,
				new ParameterImpl(
					ParameterType.Octets,
					'octets',
					undefined,
					Buffer.from([0xf8, 0xf9, 0xfa, 0xfb, 0xfc, 0xfd, 0xfe, 0xff])
				)
			),
		],
		RootType.Elements
	)

function received(codec: S101Codec, bytes: Buffer) {
	const packets: Buffer[] = []
	const events: string[] = []
	// Copied: the codec hands on a view of a buffer it reuses for the next escaping frame (#59)
	codec.on('emberPacket', (p) => packets.push(Buffer.from(p)))
	codec.on('keepaliveReq', () => events.push('keepaliveReq'))
	codec.on('keepaliveResp', () => events.push('keepaliveResp'))
	let error: unknown = undefined
	try {
		codec.dataIn(bytes)
	} catch (e) {
		error = e
	}
	return { packets, events, error }
}

describe('S101 framing compared with libs101 and libember_slim', () => {
	describe('as libember does', () => {
		it('writes a keep-alive request as libember_slim does: slot, message, command 1, version', () => {
			expect(new S101Codec().keepAliveRequest()).toEqual(libs101Encode([0x00, 0x0e, 0x01, 0x01]))
		})

		it('writes a keep-alive response as libember_slim does: slot, message, command 2, version', () => {
			expect(new S101Codec().keepAliveResponse()).toEqual(libs101Encode([0x00, 0x0e, 0x02, 0x01]))
		})

		it('writes a frame libs101 reads: bytes from 0xF8 up escaped, and the CRC over the unescaped message', () => {
			const message = awkwardPayload()
			expect([...message].filter((b) => b >= INVALID).length).toBeGreaterThan(0)

			const frames = new S101Codec().encodeBER(message)
			expect(frames).toHaveLength(1)
			const [decoded] = libs101Decode(frames[0])

			expect(decoded).toBeDefined()
			// slot, message, command, version, flags (single packet), DTD, app bytes count; then the DTD version
			expect([...decoded.subarray(0, 7)]).toEqual([0x00, 0x0e, 0x00, 0x01, 0xc0, 0x01, 0x02])
			expect(decoded.subarray(9)).toEqual(message)
		})

		it('writes a frame exactly as libember_slim does, escaped as libs101 does', () => {
			const message = awkwardPayload()
			const [frame] = new S101Codec().encodeBER(message)

			expect(frame).toEqual(libs101Encode([...header(0xc0), ...message]))
		})

		// GlowDtd.hpp: LIBEMBER_GLOWDTD_VERSION_MAJOR 2, LIBEMBER_GLOWDTD_VERSION_MINOR 50; libember_slim's
		// GLOW_SCHEMA_VERSION is 0x0232 (#54: the codec gave 2.31)
		it('gives the Glow DTD version as 2.50 in the app bytes, minor first', () => {
			const [frame] = new S101Codec().encodeBER(payload())
			const [message] = libs101Decode(frame)

			expect([...message.subarray(6, 9)]).toEqual([0x02, 0x32, 0x02])
		})

		it('writes a long message in packets libs101 reads, flagged first, middle and last', () => {
			const message = berEncode(
				Array.from({ length: 200 }, (_, i) => new NumberedTreeNodeImpl(i, new EmberNodeImpl(`node${i}`))),
				RootType.Elements
			)
			const frames = new S101Codec().encodeBER(message)
			expect(frames.length).toBeGreaterThan(2)

			const decoded = frames.map((f) => libs101Decode(f)[0])
			expect(decoded.map((m) => m[4])).toEqual([0x80, ...frames.slice(2).map(() => 0x00), 0x40])
			expect(Buffer.concat(decoded.map((m) => m.subarray(9)))).toEqual(message)
		})

		it('reads a frame libs101 writes, with the DTD version libember gives (2.50)', () => {
			const message = awkwardPayload()
			const { packets, error } = received(new S101Codec(), libs101Encode([...header(0xc0), ...message]))

			expect(error).toBeUndefined()
			expect(packets).toEqual([message])
		})

		it('reads a message libember_slim splits into packets (glowtx.c: first, middle, last)', () => {
			const message = awkwardPayload()
			const third = Math.ceil(message.length / 3)
			const bytes = Buffer.concat([
				libs101Encode([...header(0x80), ...message.subarray(0, third)]),
				libs101Encode([...header(0x00), ...message.subarray(third, 2 * third)]),
				libs101Encode([...header(0x40), ...message.subarray(2 * third)]),
			])
			const { packets, error } = received(new S101Codec(), bytes)

			expect(error).toBeUndefined()
			expect(packets).toEqual([message])
		})

		it('reads keep-alives libember_slim writes', () => {
			const { events, error } = received(
				new S101Codec(),
				Buffer.concat([libs101Encode([0x00, 0x0e, 0x01, 0x01]), libs101Encode([0x00, 0x0e, 0x02, 0x01])])
			)

			expect(error).toBeUndefined()
			expect(events).toEqual(['keepaliveReq', 'keepaliveResp'])
		})

		it('ignores bytes between frames, as libs101 does outside a frame', () => {
			const message = payload()
			const frame = libs101Encode([...header(0xc0), ...message])
			const { packets, error } = received(
				new S101Codec(),
				Buffer.concat([Buffer.from([0x00, 0x41, 0xfd, 0x10]), frame, Buffer.from([0x7f, 0x00])])
			)

			expect(error).toBeUndefined()
			expect(packets).toEqual([message])
		})

		it('starts again at a BOF within a frame, as libs101 does', () => {
			const message = payload()
			const frame = libs101Encode([...header(0xc0), ...message])
			const { packets } = received(new S101Codec(), Buffer.concat([Buffer.from([BOF, 0x00, 0x0e, 0x00]), frame]))

			expect(packets).toEqual([message])
		})

		it('drops a frame whose CRC is wrong, as libs101 does', () => {
			const frame = libs101Encode([...header(0xc0), ...payload()])
			frame[frame.length - 2] ^= 0x01 // the CRC's high byte (below 0xF8 either way)
			const { packets } = received(new S101Codec(), frame)

			expect(libs101Decode(frame)).toEqual([])
			expect(packets).toEqual([])
		})

		// glowrx.c (onPackageReceived) checks the message type, the command and the DTD, but not the slot; libs101
		// leaves the payload to its user. The documentation: the slot "should be set to 0x00" by a sender (#56).
		it('reads an EmBER packet whatever its slot', () => {
			const message = payload()
			const { packets, error } = received(
				new S101Codec(),
				libs101Encode([...header(0xc0, { slot: 1 }), ...message])
			)

			expect(error).toBeUndefined()
			expect(packets).toEqual([message])
		})

		it('reads a keep-alive whatever its slot', () => {
			const { events, error } = received(new S101Codec(), libs101Encode([0x07, 0x0e, 0x01, 0x01]))

			expect(error).toBeUndefined()
			expect(events).toEqual(['keepaliveReq'])
		})

		// glowrx.c hands a packet whose DTD isn't Glow (1) to onOtherPackageReceived, not to the Glow reader. The spec:
		// the DTD byte "must be set to one" (#56: the codec decoded it as Glow)
		it.each([0, 2])('does not read an EmBER packet of the DTD %d as Glow, and reports no error', (dtd) => {
			const { packets, error } = received(
				new S101Codec(),
				libs101Encode([...header(0xc0, { dtd }), ...payload()])
			)

			expect(error).toBeUndefined()
			expect(packets).toEqual([])
		})

		it('reads the Glow packets around one of another DTD', () => {
			const message = payload()
			const glow = libs101Encode([...header(0xc0), ...message])
			const { packets } = received(
				new S101Codec(),
				Buffer.concat([glow, libs101Encode([...header(0xc0, { dtd: 2 }), ...payload()]), glow])
			)

			expect(packets).toEqual([message, message])
		})

		// libs101's CommandType.hpp has a fourth command, ProviderState (0x03), which the documentation doesn't list.
		// glowrx.c passes any packet that isn't an EmBER packet to onOtherPackageReceived, without an error (#56: the
		// codec reported a command it doesn't know as an error).
		it.each([
			['0x03 (ProviderState)', 0x03],
			['0x7F', 0x7f],
		])('passes over a packet with the command %s without an error', (_, command) => {
			const { packets, events, error } = received(
				new S101Codec(),
				libs101Encode([0x00, 0x0e, command, 0x01, 0x01])
			)

			expect(error).toBeUndefined()
			expect(packets).toEqual([])
			expect(events).toEqual([])
		})

		// glowrx.c also passes a packet whose message type isn't EmBER (0x0E, the only one the spec lists) to
		// onOtherPackageReceived, without an error (the codec reported it as an error)
		it.each([
			['0x0F', 0x0f],
			['0x00', 0x00],
		])('passes over a packet with the message type %s without an error', (_, type) => {
			const { packets, events, error } = received(
				new S101Codec(),
				Buffer.concat([
					libs101Encode([0x00, type, 0x00, 0x01, 0xc0, 0x01, 2, 0x32, 0x02, ...payload()]),
					libs101Encode([0x00, type, 0x01, 0x01]), // what would be a keep-alive request
				])
			)

			expect(error).toBeUndefined()
			expect(packets).toEqual([])
			expect(events).toEqual([])
		})

		it('reads the packets around one with another message type', () => {
			const message = payload()
			const glow = libs101Encode([...header(0xc0), ...message])
			const { packets, error } = received(
				new S101Codec(),
				Buffer.concat([
					glow,
					libs101Encode([0x00, 0x0f, 0x00, 0x01, 0xc0, 0x01, 2, 0x32, 0x02, ...message]),
					glow,
				])
			)

			expect(error).toBeUndefined()
			expect(packets).toEqual([message, message])
		})

		it('reads the packets around one with a command it does not handle', () => {
			const message = payload()
			const glow = libs101Encode([...header(0xc0), ...message])
			const { packets, error } = received(
				new S101Codec(),
				Buffer.concat([glow, libs101Encode([0x00, 0x0e, 0x03, 0x01, 0x01]), glow])
			)

			expect(error).toBeUndefined()
			expect(packets).toEqual([message, message])
		})
	})

	// The documentation's S101 section, variant 2: "All libraries mentioned in this document support both variants".
	// emberframing.c reads a frame that starts with 0xF8, then a byte whose low three bits give the number of length
	// bytes, the message's length (most significant byte first) and the message, unescaped and without a CRC.
	// (StreamDecoder.hpp reads the same form, but works out the length wrong: its shift uses the length, still 0, for
	// the number of length bytes.)
	describe('non-escaping frames, as libember_slim reads them', () => {
		const nonEscaping = (message: number[] | Buffer, lengthLength = 4) => {
			const length = Buffer.alloc(8)
			length.writeBigUInt64BE(BigInt(message.length))
			return Buffer.from([INVALID, lengthLength, ...length.subarray(8 - lengthLength), ...message])
		}

		it('reads an EmBER packet in a non-escaping frame', () => {
			const message = awkwardPayload() // the bytes 0xFE and 0xFF, which this form doesn't escape, among them
			const { packets, error } = received(new S101Codec(), nonEscaping([...header(0xc0), ...message]))

			expect(error).toBeUndefined()
			expect(packets).toEqual([message])
		})

		it('reads a keep-alive request in a non-escaping frame', () => {
			const { events, error } = received(new S101Codec(), nonEscaping([0x00, 0x0e, 0x01, 0x01]))

			expect(error).toBeUndefined()
			expect(events).toEqual(['keepaliveReq'])
		})

		it.each([1, 2, 3, 7])('reads a frame whose length takes %d bytes', (lengthLength) => {
			const message = awkwardPayload()
			const { packets, error } = received(
				new S101Codec(),
				nonEscaping([...header(0xc0), ...message], lengthLength)
			)

			expect(error).toBeUndefined()
			expect(packets).toEqual([message])
		})

		it('passes over an empty message without an error, as emberframing.c hands it on', () => {
			const { packets, events, error } = received(new S101Codec(), Buffer.from([INVALID, 0x00]))

			expect(error).toBeUndefined()
			expect(packets).toEqual([])
			expect(events).toEqual([])
		})

		it('reads a frame that arrives a byte at a time', () => {
			const message = awkwardPayload()
			const codec = new S101Codec()
			const packets: Buffer[] = []
			codec.on('emberPacket', (p) => packets.push(p))

			for (const byte of nonEscaping([...header(0xc0), ...message])) codec.dataIn(Buffer.from([byte]))

			expect(packets).toEqual([message])
		})

		it('reads a message split into non-escaping packets (first, middle, last)', () => {
			const message = awkwardPayload()
			const third = Math.ceil(message.length / 3)
			const { packets, error } = received(
				new S101Codec(),
				Buffer.concat([
					nonEscaping([...header(0x80), ...message.subarray(0, third)]),
					nonEscaping([...header(0x00), ...message.subarray(third, 2 * third)]),
					nonEscaping([...header(0x40), ...message.subarray(2 * third)]),
				])
			)

			expect(error).toBeUndefined()
			expect(packets).toEqual([message])
		})

		it('reads escaping and non-escaping frames mixed, in order', () => {
			const message = awkwardPayload()
			const other = payload()
			const { packets, events, error } = received(
				new S101Codec(),
				Buffer.concat([
					libs101Encode([...header(0xc0), ...other]),
					nonEscaping([...header(0xc0), ...message]),
					libs101Encode([0x00, 0x0e, 0x01, 0x01]),
					nonEscaping([0x00, 0x0e, 0x02, 0x01]),
					libs101Encode([...header(0xc0), ...message]),
				])
			)

			expect(error).toBeUndefined()
			expect(packets).toEqual([other, message, message])
			expect(events).toEqual(['keepaliveReq', 'keepaliveResp'])
		})

		// An unescaped 0xF8 can't be inside an escaping frame, so one there starts a non-escaping frame
		it('reads a non-escaping frame that cuts an escaping one short, and drops the escaping one', () => {
			const message = awkwardPayload()
			const cutShort = libs101Encode([...header(0xc0), ...payload()]).subarray(0, 12)
			const { packets, error } = received(
				new S101Codec(),
				Buffer.concat([cutShort, nonEscaping([...header(0xc0), ...message])])
			)

			expect(error).toBeUndefined()
			expect(packets).toEqual([message])
		})
	})
})
