import { format } from 'util'

import Debug from 'debug'
import { EventEmitter } from 'eventemitter3'
import { SmartBuffer } from 'smart-buffer'

import { readTagAt } from '../ASN1/ber/tag.js'
import { RootBERID, StreamEntriesBERID } from '../encodings/ber/constants.js'
import { S101OversizedFrameError } from '../Errors.js'
import { at } from '../lib/at.js'

const debug = Debug('emberplus-connection:S101Codec')
debug.log = console.log.bind(console)

const S101_BOF = 0xfe
/** End of Frame!!! NOT end of file! */
const S101_EOF = 0xff
const S101_CE = 0xfd
const S101_XOR = 0x20
const S101_INV = 0xf8

const SLOT = 0x00

const MSG_EMBER = 0x0e

const CMD_EMBER = 0x00
const CMD_KEEPALIVE_REQ = 0x01
const CMD_KEEPALIVE_RESP = 0x02

const VERSION = 0x01

const FLAG_SINGLE_PACKET = 0xc0
const FLAG_FIRST_MULTI_PACKET = 0x80
const FLAG_LAST_MULTI_PACKET = 0x40
const FLAG_EMPTY_PACKET = 0x20
const FLAG_MULTI_PACKET = 0x00

const DTD_GLOW = 0x01
// Glow DTD 2.50, whose fields the library reads and writes, as libember (GlowDtd.hpp) and libember_slim
// (GLOW_SCHEMA_VERSION 0x0232) give it. It was 0x1F (2.31).
const DTD_VERSION_MAJOR = 0x02
const DTD_VERSION_MINOR = 0x32

const CRC_TABLE = [
	0x0000, 0x1189, 0x2312, 0x329b, 0x4624, 0x57ad, 0x6536, 0x74bf, 0x8c48, 0x9dc1, 0xaf5a, 0xbed3, 0xca6c, 0xdbe5,
	0xe97e, 0xf8f7, 0x1081, 0x0108, 0x3393, 0x221a, 0x56a5, 0x472c, 0x75b7, 0x643e, 0x9cc9, 0x8d40, 0xbfdb, 0xae52,
	0xdaed, 0xcb64, 0xf9ff, 0xe876, 0x2102, 0x308b, 0x0210, 0x1399, 0x6726, 0x76af, 0x4434, 0x55bd, 0xad4a, 0xbcc3,
	0x8e58, 0x9fd1, 0xeb6e, 0xfae7, 0xc87c, 0xd9f5, 0x3183, 0x200a, 0x1291, 0x0318, 0x77a7, 0x662e, 0x54b5, 0x453c,
	0xbdcb, 0xac42, 0x9ed9, 0x8f50, 0xfbef, 0xea66, 0xd8fd, 0xc974, 0x4204, 0x538d, 0x6116, 0x709f, 0x0420, 0x15a9,
	0x2732, 0x36bb, 0xce4c, 0xdfc5, 0xed5e, 0xfcd7, 0x8868, 0x99e1, 0xab7a, 0xbaf3, 0x5285, 0x430c, 0x7197, 0x601e,
	0x14a1, 0x0528, 0x37b3, 0x263a, 0xdecd, 0xcf44, 0xfddf, 0xec56, 0x98e9, 0x8960, 0xbbfb, 0xaa72, 0x6306, 0x728f,
	0x4014, 0x519d, 0x2522, 0x34ab, 0x0630, 0x17b9, 0xef4e, 0xfec7, 0xcc5c, 0xddd5, 0xa96a, 0xb8e3, 0x8a78, 0x9bf1,
	0x7387, 0x620e, 0x5095, 0x411c, 0x35a3, 0x242a, 0x16b1, 0x0738, 0xffcf, 0xee46, 0xdcdd, 0xcd54, 0xb9eb, 0xa862,
	0x9af9, 0x8b70, 0x8408, 0x9581, 0xa71a, 0xb693, 0xc22c, 0xd3a5, 0xe13e, 0xf0b7, 0x0840, 0x19c9, 0x2b52, 0x3adb,
	0x4e64, 0x5fed, 0x6d76, 0x7cff, 0x9489, 0x8500, 0xb79b, 0xa612, 0xd2ad, 0xc324, 0xf1bf, 0xe036, 0x18c1, 0x0948,
	0x3bd3, 0x2a5a, 0x5ee5, 0x4f6c, 0x7df7, 0x6c7e, 0xa50a, 0xb483, 0x8618, 0x9791, 0xe32e, 0xf2a7, 0xc03c, 0xd1b5,
	0x2942, 0x38cb, 0x0a50, 0x1bd9, 0x6f66, 0x7eef, 0x4c74, 0x5dfd, 0xb58b, 0xa402, 0x9699, 0x8710, 0xf3af, 0xe226,
	0xd0bd, 0xc134, 0x39c3, 0x284a, 0x1ad1, 0x0b58, 0x7fe7, 0x6e6e, 0x5cf5, 0x4d7c, 0xc60c, 0xd785, 0xe51e, 0xf497,
	0x8028, 0x91a1, 0xa33a, 0xb2b3, 0x4a44, 0x5bcd, 0x6956, 0x78df, 0x0c60, 0x1de9, 0x2f72, 0x3efb, 0xd68d, 0xc704,
	0xf59f, 0xe416, 0x90a9, 0x8120, 0xb3bb, 0xa232, 0x5ac5, 0x4b4c, 0x79d7, 0x685e, 0x1ce1, 0x0d68, 0x3ff3, 0x2e7a,
	0xe70e, 0xf687, 0xc41c, 0xd595, 0xa12a, 0xb0a3, 0x8238, 0x93b1, 0x6b46, 0x7acf, 0x4854, 0x59dd, 0x2d62, 0x3ceb,
	0x0e70, 0x1ff9, 0xf78f, 0xe606, 0xd49d, 0xc514, 0xb1ab, 0xa022, 0x92b9, 0x8330, 0x7bc7, 0x6a4e, 0x58d5, 0x495c,
	0x3de3, 0x2c6a, 0x1ef1, 0x0f78,
]

export type S101CodecEvents = {
	emberPacket: [packet: Buffer]
	emberStreamPacket: [packet: Buffer]
	/** A keep-alive request, and whether it came in a non-escaping frame, which a reply answers in kind */
	keepaliveReq: [nonEscaping: boolean]
	keepaliveResp: []
}

// This is enough for typical size of Ember data, but buffer is Dynamic to allow for larger data if needed
const BUFFER_FRAME_SIZE = 64 * 1024

// Largest in-progress single S101 frame we will buffer before treating the
// peer as abusive. Legitimate large payloads arrive via multi-packet
// reassembly, so a single frame never needs to approach this. Tune as needed.
const MAX_FRAME_BUFFER_SIZE = 4 * 1024 * 1024

// Largest reassembled multi-packet Ember message we will accept.
const MAX_MULTI_PACKET_SIZE = 16 * 1024 * 1024

export default class S101Codec extends EventEmitter<S101CodecEvents> {
	inbuf = new SmartBuffer({ size: BUFFER_FRAME_SIZE })
	private frameBuffer?: Buffer
	escaped = false

	private multiPacketBuffer?: SmartBuffer
	private isMultiPacket = false

	/**
	 * Reads S101 frames in either form the spec gives (the S101 section, "Variant 1" and "Variant 2"): escaping frames,
	 * from BOF to EOF, the message escaped and followed by its CRC; and non-escaping frames, which start with 0xF8 (never
	 * found outside an escaping frame, where it is escaped): a byte whose low three bits give the number of length
	 * bytes, the length, most significant byte first, and the message, neither escaped nor followed by a CRC. A frame
	 * that runs past the data is kept for the next read.
	 */
	dataIn(buf: Buffer): void {
		// console.log('TimeStamp: ', Date.now(), 'dataIn', buf.toString('hex'))

		// If we have leftover data from a previous incomplete frame, prepend it
		if (this.frameBuffer) {
			buf = Buffer.concat([this.frameBuffer, buf])
			this.frameBuffer = undefined
		}

		const errors: Error[] = []
		const handle = (read: () => void) => {
			try {
				read()
			} catch (e) {
				// An oversized message is the end of the connection: report it straight away, as before
				if (e instanceof S101OversizedFrameError) throw e
				// Any other rejected frame (or a listener that threw) is reported once the rest of the read is handled
				errors.push(e instanceof Error ? e : new Error(String(e)))
			}
		}

		// The next 0xF8 at or after an offset, found once per stretch of data, not once per frame
		let nextNonEscaping = buf.indexOf(S101_INV)
		const nonEscapingFrom = (offset: number) => {
			if (nextNonEscaping !== -1 && nextNonEscaping < offset) nextNonEscaping = buf.indexOf(S101_INV, offset)
			return nextNonEscaping
		}

		let frameOffset = 0
		while (frameOffset < buf.length) {
			const bof = buf.indexOf(S101_BOF, frameOffset)
			const nonEscaping = nonEscapingFrom(frameOffset)
			if (bof === -1 && nonEscaping === -1) break

			if (nonEscaping !== -1 && (bof === -1 || nonEscaping < bof)) {
				const frame = readNonEscapingFrame(buf, nonEscaping)
				if (frame === null) {
					// Kept whole: its declared length is within bounds (or not all its length bytes have come yet)
					this.frameBuffer = buf.subarray(nonEscaping)
					break
				}
				if ('oversized' in frame) {
					this.dropOversized(
						format('dropping oversized non-escaping S101 frame: %d bytes declared', frame.oversized)
					)
				}
				handle(() => this.handleMessage(frame.message, true))
				frameOffset = frame.end
				continue
			}

			let frameStart = bof
			const frameEnd = buf.indexOf(S101_EOF, frameStart + 1)

			// An unescaped 0xF8 can't be in an escaping frame: this one was cut short, and a non-escaping frame starts there
			const cutShortAt = nonEscapingFrom(frameStart + 1)
			if (cutShortAt !== -1 && (frameEnd === -1 || cutShortAt < frameEnd)) {
				debug('dropping an escaping frame cut short by a non-escaping one')
				frameOffset = cutShortAt
				continue
			}

			if (frameEnd === -1) {
				//console.log('Parsing frameEnd to next chunk')
				const pending = buf.subarray(frameStart)
				if (pending.length > MAX_FRAME_BUFFER_SIZE) {
					this.dropOversized(
						format('dropping oversized S101 frame: %d bytes buffered without EOF', pending.length)
					)
				}
				this.frameBuffer = pending
				break
			}

			// A BOF always starts a new frame, so anything from an earlier BOF is discarded
			frameStart = buf.lastIndexOf(S101_BOF, frameEnd)

			this.inbuf.clear()
			let chunkOffset = frameStart + 1
			// Reset escaped state at frame start
			this.escaped = false

			while (chunkOffset < frameEnd) {
				const b = at(buf, chunkOffset)

				if (this.escaped) {
					this.inbuf.writeUInt8(b ^ S101_XOR)
					this.escaped = false
					chunkOffset++
				} else if (b === S101_CE) {
					this.escaped = true
					chunkOffset++
				} else {
					// Find next escape or end
					let nextSpecial = chunkOffset + 1
					while (nextSpecial < frameEnd) {
						const nb = buf[nextSpecial]
						if (nb === S101_CE || nb === S101_EOF) break
						nextSpecial++
					}

					// Write the chunk up to the next special character
					this.inbuf.writeBuffer(buf.subarray(chunkOffset, nextSpecial))
					chunkOffset = nextSpecial
				}
			}

			this.escaped = false // Reset escaped state at frame end
			this.inbuf.readOffset = 0

			// console.log('Buffer 00-16', this.inbuf.toString('hex').substring(0, 40))
			handle(() => this.handleFrame(this.inbuf))
			frameOffset = frameEnd + 1
		}

		// One error per read, as before: the frame's own error, or all of them when several were rejected
		const [error, ...others] = errors
		if (error && !others.length) throw error
		if (others.length) throw new AggregateError(errors, format('dropped %d S101 frames', errors.length))
	}

	/** Clears the state, so the next read starts clean, and reports a frame too large to take */
	private dropOversized(message: string): never {
		this.frameBuffer = undefined
		this.escaped = false
		this.resetMultiPacketBuffer()
		throw new S101OversizedFrameError(message)
	}

	/**
	 * A complete Ember message's root tag and the tag of the collection in it, in either tag form (an encoder may write
	 * every tag in two bytes); null where the message ends first or the tag is malformed
	 */
	private rootTags(buffer: Buffer): { root: number | null; collection: number | null } {
		try {
			const root = readTagAt(buffer, 0)
			if (!root || root.size >= buffer.length) return { root: root?.tag ?? null, collection: null }
			// the root's length: one byte, or 0x80 | n followed by n bytes (0x80 alone is indefinite)
			const lengthByte = at(buffer, root.size)
			const collectionOffset = root.size + 1 + (lengthByte & 0x80 ? lengthByte & 0x7f : 0)
			return { root: root.tag, collection: readTagAt(buffer, collectionOffset)?.tag ?? null }
		} catch {
			return { root: null, collection: null }
		}
	}

	/** Whether a complete Ember message is a stream collection: the root holds a stream collection, not elements */
	private isEmberStreamPacket(buffer: Buffer): boolean {
		const { root, collection } = this.rootTags(buffer)
		return root === RootBERID && collection === StreamEntriesBERID
	}

	/** An escaping frame, unescaped: the message, then its CRC */
	handleFrame(frame: SmartBuffer): void {
		const buffer = frame.toBuffer()
		if (!this.validateFrame(buffer)) {
			throw new Error(format('dropping frame of length %d with invalid CRC', frame.length))
		}
		this.handleMessage(buffer.subarray(0, buffer.length - 2), false)
	}

	/** A message, from a frame of either form: slot, message type, command and what the command carries */
	private handleMessage(message: Buffer, nonEscaping: boolean): void {
		if (message.length < 3) {
			// Too short for a slot, message type and command, so not Ember+: passed over without an error, as
			// libember_slim's reader passes it to the application
			debug('ignoring message of %d bytes', message.length)
			return
		}
		const frame = SmartBuffer.fromBuffer(message)

		const slot = frame.readUInt8()
		const messageType = frame.readUInt8()
		if (messageType != MSG_EMBER) {
			// Not Ember+ (0x0E, the only message type the spec lists): passed over without an error, as libember_slim's
			// reader passes it to the application. (It was an error.)
			debug('ignoring message of %d bytes with message type %d (not Ember)', frame.length, messageType)
			return
		}
		// Any slot is read. The spec: the slot addresses a sub-device and "should be set to 0x00" (by a sender);
		// libember_slim's reader doesn't check it. Frames with another slot were dropped as not Ember.
		if (slot != SLOT) debug('frame for slot %d', slot)

		const command = frame.readUInt8()
		if (command === CMD_KEEPALIVE_REQ) {
			debug('received keepalive request%s', nonEscaping ? ' (non-escaping)' : '')
			this.emit('keepaliveReq', nonEscaping)
		} else if (command === CMD_KEEPALIVE_RESP) {
			debug('received keepalive response')
			this.emit('keepaliveResp')
		} else if (command === CMD_EMBER) {
			this.handleEmberPayload(frame.readBuffer())
		} else {
			// A command this codec doesn't handle, such as libs101's ProviderState (0x03), which the spec doesn't describe,
			// is passed over without an error, as libember_slim's reader passes it to the application. (It was an error.)
			debug('ignoring message of %d bytes with unknown command %d', frame.length, command)
		}
	}

	/** An EmBER packet's part of an escaping frame, from the version byte, with the frame's CRC at the end */
	handleEmberFrame(frame: SmartBuffer): void {
		const data = frame.readBuffer()
		this.handleEmberPayload(data.subarray(0, data.length - 2))
	}

	/** An EmBER packet's part of a message, from the version byte */
	private handleEmberPayload(data: Buffer): void {
		const frame = SmartBuffer.fromBuffer(data)
		const version = frame.readUInt8()
		const flags = frame.readUInt8()
		const dtd = frame.readUInt8()
		let appBytes = frame.readUInt8()

		if (version !== VERSION) {
			debug('Warning: Unknown ember frame version %d', version)
		}

		if (dtd !== DTD_GLOW) {
			// Glow (1) is the only DTD, and the spec says the DTD byte "must be set to one". libember_slim's reader doesn't
			// decode another DTD's packet as Glow, and nor do we: it is dropped, without an error. (It was decoded as Glow.)
			debug('dropping packet with DTD %d, expected %d (Glow)', dtd, DTD_GLOW)
			return
		}

		if (appBytes < 2) {
			debug('Warning: Frame missing Glow DTD version')
			frame.readOffset += appBytes
		} else {
			frame.readOffset += 1 // Skip minor version
			frame.readOffset += 1 // Skip major version
			appBytes -= 2
			if (appBytes > 0) {
				frame.readOffset += appBytes
				debug('Warning: App bytes with unknown meaning left over')
			}
		}

		const payload = frame.readBuffer()

		if ((flags & FLAG_SINGLE_PACKET) === FLAG_SINGLE_PACKET) {
			if ((flags & FLAG_EMPTY_PACKET) === 0) {
				// A copy for the listener to keep: the payload is a view of the buffer an escaping frame is unescaped
				// into, which the next escaping frame overwrites, or of the caller's read
				const packet = Buffer.from(payload)
				// Check if this is a metering packet
				if (this.isEmberStreamPacket(packet)) {
					this.handleEmberStreamPacket(packet)
				} else {
					this.handleEmberPacket(packet)
				}
			}
		} else {
			// Multi-packet handling
			if ((flags & FLAG_FIRST_MULTI_PACKET) === FLAG_FIRST_MULTI_PACKET) {
				debug('multi ember packet start')
				this.multiPacketBuffer = new SmartBuffer()
				this.isMultiPacket = true
				this.multiPacketBuffer.writeBuffer(payload)

				if (this.multiPacketBuffer.length > MAX_MULTI_PACKET_SIZE) {
					this.resetMultiPacketBuffer()
					throw new S101OversizedFrameError(
						format('dropping oversized multi-packet message: exceeded %d bytes', MAX_MULTI_PACKET_SIZE)
					)
				}
			} else if (this.isMultiPacket && this.multiPacketBuffer) {
				this.multiPacketBuffer.writeBuffer(payload)

				if (this.multiPacketBuffer.length > MAX_MULTI_PACKET_SIZE) {
					this.resetMultiPacketBuffer()
					throw new S101OversizedFrameError(
						format('dropping oversized multi-packet message: exceeded %d bytes', MAX_MULTI_PACKET_SIZE)
					)
				}

				if ((flags & FLAG_LAST_MULTI_PACKET) === FLAG_LAST_MULTI_PACKET) {
					debug('multi ember packet end')
					// The reassembly buffer is dropped once the message is handed on, so no copy is needed
					const completeData = this.multiPacketBuffer.toBuffer()
					try {
						// Check if this is a stream packet, can also be a normal packet. (The tag that tells them apart
						// follows the root's length field, which is longer than 1 byte for a long definite length.)
						if (this.isEmberStreamPacket(completeData)) {
							this.handleEmberStreamPacket(completeData)
						} else {
							this.handleEmberPacket(completeData)
						}
					} finally {
						this.resetMultiPacketBuffer()
					}
				}
			}
		}
	}
	// The listener decodes the message (S101Socket, which reports a message it can't decode as an error). An error
	// thrown by a listener is reported by dataIn, after the rest of the read.
	private handleEmberPacket(data: Buffer): void {
		if (this.rootTags(data).root === RootBERID) {
			this.emit('emberPacket', data)
		}
	}

	private handleEmberStreamPacket(data: Buffer): void {
		this.emit('emberStreamPacket', data)
	}

	resetMultiPacketBuffer(): void {
		this.multiPacketBuffer = undefined
		this.isMultiPacket = false
	}

	encodeBER(data: Buffer): Buffer[] {
		const frames = []
		const encbuf = new SmartBuffer()
		for (let i = 0; i < data.length; i++) {
			const b = data.readUInt8(i)
			if (b < S101_INV) {
				encbuf.writeUInt8(b)
			} else {
				encbuf.writeUInt8(S101_CE)
				encbuf.writeUInt8(b ^ S101_XOR)
			}

			if (encbuf.length >= 1024 && i < data.length - 1) {
				if (frames.length === 0) {
					frames.push(this._makeBERFrame(FLAG_FIRST_MULTI_PACKET, encbuf.toBuffer()))
				} else {
					frames.push(this._makeBERFrame(FLAG_MULTI_PACKET, encbuf.toBuffer()))
				}
				encbuf.clear()
			}
		}

		if (frames.length == 0) {
			frames.push(this._makeBERFrame(FLAG_SINGLE_PACKET, encbuf.toBuffer()))
		} else {
			frames.push(this._makeBERFrame(FLAG_LAST_MULTI_PACKET, encbuf.toBuffer()))
		}

		return frames
	}

	keepAliveRequest(): Buffer {
		const packet = new SmartBuffer()
		packet.writeUInt8(S101_BOF)
		packet.writeUInt8(SLOT)
		packet.writeUInt8(MSG_EMBER)
		packet.writeUInt8(CMD_KEEPALIVE_REQ)
		packet.writeUInt8(VERSION)
		return this._finalizeBuffer(packet)
	}

	/**
	 * A keep-alive response. Non-escaping when it answers a request that came in a non-escaping frame: the spec has a
	 * consumer learn that way whether the provider reads such frames ("If the provider replies with the same framing,
	 * the non-escaping format is supported").
	 */
	keepAliveResponse(nonEscaping = false): Buffer {
		if (nonEscaping) return nonEscapingFrame([SLOT, MSG_EMBER, CMD_KEEPALIVE_RESP, VERSION])
		const packet = new SmartBuffer()
		packet.writeUInt8(S101_BOF)
		packet.writeUInt8(SLOT)
		packet.writeUInt8(MSG_EMBER)
		packet.writeUInt8(CMD_KEEPALIVE_RESP)
		packet.writeUInt8(VERSION)
		return this._finalizeBuffer(packet)
	}

	validateFrame(buf: Buffer): boolean {
		return this._calculateCRC(buf) == 0xf0b8
	}

	private _makeBERFrame(flags: number, data: Buffer) {
		const frame = new SmartBuffer()
		frame.writeUInt8(S101_BOF)
		frame.writeUInt8(SLOT)
		frame.writeUInt8(MSG_EMBER)
		frame.writeUInt8(CMD_EMBER)
		frame.writeUInt8(VERSION)
		frame.writeUInt8(flags)
		frame.writeUInt8(DTD_GLOW)
		frame.writeUInt8(2) // number of app bytes
		frame.writeUInt8(DTD_VERSION_MINOR)
		frame.writeUInt8(DTD_VERSION_MAJOR)
		frame.writeBuffer(data)
		return this._finalizeBuffer(frame)
	}

	private _finalizeBuffer(smartbuf: SmartBuffer) {
		const crc = ~this._calculateCRCCE(smartbuf.toBuffer().slice(1, smartbuf.length)) & 0xffff
		const crcHi = crc >> 8
		const crcLo = crc & 0xff

		if (crcLo < S101_INV) {
			smartbuf.writeUInt8(crcLo)
		} else {
			smartbuf.writeUInt8(S101_CE)
			smartbuf.writeUInt8(crcLo ^ S101_XOR)
		}

		if (crcHi < S101_INV) {
			smartbuf.writeUInt8(crcHi)
		} else {
			smartbuf.writeUInt8(S101_CE)
			smartbuf.writeUInt8(crcHi ^ S101_XOR)
		}

		smartbuf.writeUInt8(S101_EOF)
		return smartbuf.toBuffer()
	}

	private _calculateCRC(buf: Buffer) {
		let crc = 0xffff
		for (let i = 0; i < buf.length; i++) {
			const b = buf.readUInt8(i)
			crc = ((crc >> 8) ^ at(CRC_TABLE, (crc ^ b) & 0xff)) & 0xffff
		}
		return crc
	}

	private _calculateCRCCE(buf: Buffer) {
		let crc = 0xffff
		for (let i = 0; i < buf.length; i++) {
			let b = buf.readUInt8(i)
			if (b == S101_CE) {
				b = S101_XOR ^ buf.readUInt8(++i)
			}
			crc = ((crc >> 8) ^ at(CRC_TABLE, (crc ^ b) & 0xff)) & 0xffff
		}
		return crc
	}
}

/**
 * The non-escaping (variant 2) frame starting at `start`, its 0xF8: as libember_slim reads it (emberframing.c), the
 * number of length bytes is the next byte's low three bits (the others are reserved), then the length, most
 * significant byte first, then the message. Null when the data ends first; the declared length when it is more than
 * this codec takes in one frame.
 */
function readNonEscapingFrame(
	buf: Buffer,
	start: number
): { message: Buffer; end: number } | { oversized: number } | null {
	if (start + 1 >= buf.length) return null
	const lengthLength = at(buf, start + 1) & 0x07
	const messageStart = start + 2 + lengthLength
	if (messageStart > buf.length) return null
	let length = 0
	for (let i = start + 2; i < messageStart; i++) length = length * 0x100 + at(buf, i) // not `<< 8`: up to seven bytes
	if (length > MAX_FRAME_BUFFER_SIZE) return { oversized: length }
	if (messageStart + length > buf.length) return null
	return { message: buf.subarray(messageStart, messageStart + length), end: messageStart + length }
}

/** A message in a non-escaping frame: 0xF8, four length bytes (as libember_slim writes them), the message */
function nonEscapingFrame(message: number[]): Buffer {
	const frame = Buffer.alloc(6 + message.length)
	frame[0] = S101_INV
	frame[1] = 4
	frame.writeUInt32BE(message.length, 2)
	frame.set(message, 6)
	return frame
}
