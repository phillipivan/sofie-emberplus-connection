import { SmartBuffer } from 'smart-buffer'

import { withTwoByteTags } from '../../encodings/ber/__tests__/encodingForms.js'
import { berEncode } from '../../encodings/ber/index.js'
import { at } from '../../lib/at.js'
import { GetDirectoryImpl } from '../../model/Command.js'
import { NumberedTreeNodeImpl, ParameterImpl, ParameterType, QualifiedElementImpl } from '../../model/index.js'
import { StreamEntryImpl } from '../../model/StreamEntry.js'
import { RootType } from '../../types/types.js'
import S101Codec from '../S101Codec.js'

const FLAG_FIRST_MULTI_PACKET = 0x80
const FLAG_MULTI_PACKET = 0x00

// Build a raw ember frame in the shape handleEmberFrame() expects:
// version, flags, dtd, appBytes, 2 app bytes, payload, then 2 CRC bytes
// (handleEmberFrame strips the trailing 2 bytes as CRC).
function makeEmberFrame(flags: number, payload: Buffer): SmartBuffer {
	const sb = new SmartBuffer()
	sb.writeUInt8(0x01) // version
	sb.writeUInt8(flags)
	sb.writeUInt8(0x01) // dtd (glow)
	sb.writeUInt8(2) // number of app bytes
	sb.writeUInt8(0x32) // dtd minor version (Glow 2.50)
	sb.writeUInt8(0x02) // dtd major version
	sb.writeBuffer(payload)
	sb.writeUInt8(0x00) // CRC lo (stripped)
	sb.writeUInt8(0x00) // CRC hi (stripped)
	return sb
}

describe('S101Codec DoS hardening', () => {
	test('unterminated frame is dropped, not buffered unbounded', () => {
		const codec = new S101Codec()

		// Begin-of-frame, then a stream of non-EOF bytes that never completes a frame.
		codec.dataIn(Buffer.from([0xfe]))

		const chunk = Buffer.alloc(1024 * 1024) // 1 MB of zeros, no 0xff
		expect(() => {
			for (let i = 0; i < 8; i++) {
				codec.dataIn(chunk)
			}
		}).toThrow(/oversized/i)

		// State must be reset so the next dataIn starts clean.
		expect((codec as any).frameBuffer).toBeUndefined()
	}, 5000)

	test('unterminated multi-packet message is dropped', () => {
		const codec = new S101Codec()

		const payload = Buffer.alloc(1024 * 1024) // 1 MB per frame

		// Start a multi-packet message...
		codec.handleEmberFrame(makeEmberFrame(FLAG_FIRST_MULTI_PACKET, payload))

		// ...then stream continuation frames that never set the last-flag.
		expect(() => {
			for (let i = 0; i < 32; i++) {
				codec.handleEmberFrame(makeEmberFrame(FLAG_MULTI_PACKET, payload))
			}
		}).toThrow(/oversized/i)

		// Reassembly state must be reset.
		expect((codec as any).multiPacketBuffer).toBeUndefined()
		expect((codec as any).isMultiPacket).toBe(false)
	}, 5000)

	// A non-escaping frame gives its length up front (up to seven bytes of it): one longer than a frame may be is
	// dropped at once, not buffered
	test.each([
		['2^31 - 1', [0x04, 0x7f, 0xff, 0xff, 0xff]],
		['2^56 - 1', [0x07, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff]],
	])('a non-escaping frame declaring %s bytes is dropped, and the codec reads on', (_, header) => {
		const codec = new S101Codec()
		const events: string[] = []
		codec.on('keepaliveReq', () => events.push('req'))

		expect(() => codec.dataIn(Buffer.from([0xf8, ...header, 0x00, 0x0e]))).toThrow(/oversized/i)
		expect((codec as any).frameBuffer).toBeUndefined()

		codec.dataIn(codec.keepAliveRequest())
		expect(events).toEqual(['req'])
	})

	test('sanity: a normal well-formed frame still decodes and emits', () => {
		const codec = new S101Codec()

		const events: string[] = []
		codec.on('keepaliveReq', () => events.push('req'))

		// keepAliveRequest() produces a complete, CRC-valid S101 frame.
		codec.dataIn(codec.keepAliveRequest())

		expect(events).toEqual(['req'])
	})
})

// A consumer's GetDirectory request on the root, as one S101 frame
function getDirectoryFrame(codec: S101Codec): Buffer {
	return at(codec.encodeBER(berEncode([new NumberedTreeNodeImpl(0, new GetDirectoryImpl())], RootType.Elements)), 0)
}

function collectEvents(codec: S101Codec): string[] {
	const events: string[] = []
	codec.on('keepaliveReq', () => events.push('keepaliveReq'))
	codec.on('emberPacket', () => events.push('emberPacket'))
	return events
}

// Ember+ specification, S101 › Variant 1 › Decoding a message: "When a decoder reads a BOF byte, it always
// indicates the start of a new frame. So the current data can be discarded if there is any."
describe('S101Codec frame parsing', () => {
	test('a stray BOF before a frame is discarded', () => {
		const codec = new S101Codec()
		const events = collectEvents(codec)

		codec.dataIn(Buffer.concat([Buffer.from([0xfe]), getDirectoryFrame(codec)]))

		expect(events).toEqual(['emberPacket'])
	})

	test('an abandoned frame is discarded when a new frame starts', () => {
		const codec = new S101Codec()
		const events = collectEvents(codec)
		const frame = getDirectoryFrame(codec)

		codec.dataIn(Buffer.concat([frame.subarray(0, 8), frame]))

		expect(events).toEqual(['emberPacket'])
	})

	test('an abandoned frame is discarded when the new frame arrives in a later read', () => {
		const codec = new S101Codec()
		const events = collectEvents(codec)
		const frame = getDirectoryFrame(codec)

		codec.dataIn(frame.subarray(0, 8))
		codec.dataIn(frame)

		expect(events).toEqual(['emberPacket'])
	})

	// A BOF and EOF fewer than 4 bytes apart were buffered as an incomplete frame, and the same EOF was found
	// again on every later read, so nothing after it was processed.
	// `fe 00 00 ff` is an empty message with a good CRC (0x0000, the CRC of no bytes): not Ember, so it is passed over
	// without an error, as libember_slim passes it over; the others fail the CRC.
	test.each<[number[], string]>([
		[[0xfe, 0xff], 'invalid CRC'],
		[[0xfe, 0x00, 0xff], 'invalid CRC'],
		[[0xfe, 0x00, 0x00, 0xff], 'no error'],
	])('a short frame %j is dropped and later frames still arrive', (short, error) => {
		const codec = new S101Codec()
		const events = collectEvents(codec)

		const thrown = (() => {
			try {
				codec.dataIn(Buffer.from(short))
				return 'no error'
			} catch (e) {
				return String(e)
			}
		})()
		expect(thrown).toContain(error)
		codec.dataIn(codec.keepAliveRequest())
		codec.dataIn(getDirectoryFrame(codec))

		expect(events).toEqual(['keepaliveReq', 'emberPacket'])
	})
})

// A message is a stream collection or an element tree by the tag that follows the root's length field. That field
// is 1 byte for a short or an indefinite length, and 2 to 4 bytes for a long definite one.
describe('S101Codec messages in several frames', () => {
	// An element tree of about `size` bytes: a parameter with a string value that long
	const tree = (size: number) =>
		berEncode(
			[
				new QualifiedElementImpl(
					'1.1',
					new ParameterImpl(ParameterType.String, 'p', undefined, 'x'.repeat(size))
				),
			],
			RootType.Elements
		)
	const streamEntries = (count: number) =>
		Array.from({ length: count }, (_, i) => new StreamEntryImpl(i + 1, { type: ParameterType.Integer, value: i }))
	// The same collection as a provider that uses indefinite lengths for the root and the collection sends it
	const indefiniteLengthStreams = (count: number) => {
		const definite = berEncode(streamEntries(count), RootType.Streams)
		const entries = definite.subarray(8) // after the root's and the collection's tag and 3 length bytes each
		return Buffer.concat([Buffer.from('60806680', 'hex'), entries, Buffer.from('00000000', 'hex')])
	}

	test.each<[string, Buffer, RegExp, string]>([
		['an element tree', tree(3000), /^6082....6b/, 'emberPacket'],
		['an element tree whose length starts with 0x66', tree(0x6600), /^608266..6b/, 'emberPacket'],
		[
			'a stream collection with a definite length',
			berEncode(streamEntries(200), RootType.Streams),
			/^6082....66/,
			'emberStreamPacket',
		],
		['a stream collection with an indefinite length', indefiniteLengthStreams(200), /^608066/, 'emberStreamPacket'],
	])('%s is emitted as one', (_, message, header, expected) => {
		// the root's tag and length, then the tag that tells the two apart: 0x6b a tree, 0x66 a stream collection
		expect(message.subarray(0, 5).toString('hex')).toMatch(header)

		const receiver = new S101Codec()
		const events: Array<[string, Buffer]> = []
		receiver.on('emberPacket', (packet) => events.push(['emberPacket', packet]))
		receiver.on('emberStreamPacket', (packet) => events.push(['emberStreamPacket', packet]))
		const frames = new S101Codec().encodeBER(message)
		for (const frame of frames) receiver.dataIn(frame)

		expect(frames.length).toBeGreaterThan(1)
		expect(events).toEqual([[expected, message]])
	})
})

// The codec unescapes every escaping frame into one buffer, which it reuses: what it hands a listener has to be a copy
// the listener can keep. It was a view of that buffer, so the next escaping frame overwrote it (#59).
describe('S101Codec packets a listener keeps', () => {
	const element = (identifier: string) =>
		berEncode(
			[new NumberedTreeNodeImpl(1, new ParameterImpl(ParameterType.String, identifier, undefined, identifier))],
			RootType.Elements
		)
	const streams = (value: number) =>
		berEncode([new StreamEntryImpl(1, { type: ParameterType.Integer, value })], RootType.Streams)

	function keep(codec: S101Codec): Buffer[] {
		const packets: Buffer[] = []
		codec.on('emberPacket', (p) => packets.push(p))
		codec.on('emberStreamPacket', (p) => packets.push(p))
		return packets
	}

	test('keep their bytes when more frames follow in the same read', () => {
		const codec = new S101Codec()
		const packets = keep(codec)
		const sent = [element('first'), streams(5), element('a second, longer one')]

		codec.dataIn(Buffer.concat(sent.flatMap((m) => codec.encodeBER(m))))

		expect(packets).toEqual(sent)
	})

	test('keep their bytes when the next read brings another frame', () => {
		const codec = new S101Codec()
		const packets = keep(codec)
		const sent = [element('first'), element('the second')]

		for (const m of sent) codec.dataIn(Buffer.concat(codec.encodeBER(m)))

		expect(packets).toEqual(sent)
	})

	test('keep their bytes when the caller reuses its read (a non-escaping frame)', () => {
		const codec = new S101Codec()
		const packets = keep(codec)
		const sent = element('first')
		const message = Buffer.concat([Buffer.from([0x00, 0x0e, 0x00, 0x01, 0xc0, 0x01, 0x02, 0x32, 0x02]), sent])
		const read = Buffer.concat([Buffer.from([0xf8, 0x04, 0, 0, 0, message.length]), message])

		codec.dataIn(read)
		read.fill(0)

		expect(packets).toEqual([sent])
	})
})

// A frame the codec rejects (here for its CRC) must not take the frames after it in the same read with it
describe('S101Codec a rejected frame', () => {
	/** The frame with one byte of its contents changed, so its CRC no longer matches */
	function corrupt(frame: Buffer): Buffer {
		const copy = Buffer.from(frame)
		const special = (b: number) => b >= 0xfd
		const i = copy.findIndex((b, index) => index > 4 && !special(b) && !special(b ^ 0x01))
		copy[i] = at(copy, i) ^ 0x01
		return copy
	}

	function received(codec: S101Codec, reads: Buffer[]) {
		const events = collectEvents(codec)
		const errors: unknown[] = []
		for (const read of reads) {
			try {
				codec.dataIn(read)
			} catch (e) {
				errors.push(e)
			}
		}
		return { events, errors }
	}

	test('is reported, and a frame after it in the same read still arrives', () => {
		const codec = new S101Codec()

		const { events, errors } = received(codec, [
			Buffer.concat([corrupt(getDirectoryFrame(codec)), getDirectoryFrame(codec)]),
		])

		expect(events).toEqual(['emberPacket'])
		expect(errors).toHaveLength(1)
		expect(String(errors[0])).toMatch(/invalid CRC/)
	})

	test('does not lose a frame after it that is split across reads', () => {
		const codec = new S101Codec()
		const good = getDirectoryFrame(codec)

		const { events } = received(codec, [Buffer.concat([corrupt(good), good.subarray(0, 8)]), good.subarray(8)])

		expect(events).toEqual(['emberPacket'])
	})

	test('is reported once per frame when several are rejected in one read', () => {
		const codec = new S101Codec()
		const bad = corrupt(getDirectoryFrame(codec))

		const { events, errors } = received(codec, [
			Buffer.concat([bad, codec.keepAliveRequest(), bad, getDirectoryFrame(codec)]),
		])

		expect(events).toEqual(['keepaliveReq', 'emberPacket'])
		expect(errors).toHaveLength(1)
		expect(errors[0]).toBeInstanceOf(AggregateError)
		expect((errors[0] as AggregateError).errors.map(String)).toEqual([
			expect.stringMatching(/invalid CRC/),
			expect.stringMatching(/invalid CRC/),
		])
	})
})

// The Ember+ documentation lets an encoder write every tag in two bytes (Implementation recommendations › Encoder): the
// root's tag is then 7f 00, an element collection's 7f 0b and a stream collection's 7f 06
describe('S101Codec messages with two-byte tags', () => {
	const tree = berEncode(
		[new QualifiedElementImpl('1.1', new ParameterImpl(ParameterType.Integer, 'gain', undefined, 3))],
		RootType.Elements
	)
	const streams = berEncode([new StreamEntryImpl(1, { type: ParameterType.Integer, value: -3 })], RootType.Streams)
	const largeTree = berEncode(
		[new QualifiedElementImpl('1.1', new ParameterImpl(ParameterType.String, 'p', undefined, 'x'.repeat(3000)))],
		RootType.Elements
	)
	const largeStreams = berEncode(
		Array.from({ length: 200 }, (_, i) => new StreamEntryImpl(i + 1, { type: ParameterType.Integer, value: i })),
		RootType.Streams
	)

	test.each<[string, Buffer, string]>([
		['an element tree', withTwoByteTags(tree), 'emberPacket'],
		['an element tree with four-byte lengths', withTwoByteTags(tree, { longLengths: true }), 'emberPacket'],
		['a stream collection', withTwoByteTags(streams), 'emberStreamPacket'],
		[
			'a stream collection with four-byte lengths',
			withTwoByteTags(streams, { longLengths: true }),
			'emberStreamPacket',
		],
		['an element tree in several frames', withTwoByteTags(largeTree), 'emberPacket'],
		['a stream collection in several frames', withTwoByteTags(largeStreams), 'emberStreamPacket'],
	])('%s is emitted as such', (_, message, expected) => {
		expect(message.subarray(0, 2).toString('hex')).toBe('7f00')

		const receiver = new S101Codec()
		const events: Array<[string, Buffer]> = []
		receiver.on('emberPacket', (packet) => events.push(['emberPacket', packet]))
		receiver.on('emberStreamPacket', (packet) => events.push(['emberStreamPacket', packet]))
		for (const frame of new S101Codec().encodeBER(message)) receiver.dataIn(frame)

		expect(events).toEqual([[expected, message]])
	})
})
