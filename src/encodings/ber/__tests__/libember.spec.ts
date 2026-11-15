import * as Ber from '../../../Ber/index.js'
import { CommandType, FieldFlags, GetDirectoryImpl } from '../../../model/Command.js'
import { ConnectionDisposition, ConnectionImpl, ConnectionOperation } from '../../../model/Connection.js'
import { MatrixAddressingMode, MatrixImpl, MatrixType } from '../../../model/Matrix.js'
import { ParameterAccess, ParameterImpl, ParameterType } from '../../../model/Parameter.js'
import { StreamDescriptionImpl, StreamFormat } from '../../../model/StreamDescription.js'
import { Collection, EmberValue, RootElement } from '../../../types/types.js'
import * as Constants from '../constants.js'
import { decodeCommand } from '../decoder/Command.js'
import { decodeConnection } from '../decoder/Connection.js'
import { decodeInvocationResult } from '../decoder/InvocationResult.js'
import { decodeMatrix } from '../decoder/Matrix.js'
import { decodeParameter } from '../decoder/Parameter.js'
import { decodeStreamDescription } from '../decoder/StreamDescription.js'
import { decodeStringIntegerCollection } from '../decoder/StringIntegerCollection.js'
import { encodeCommand } from '../encoder/Command.js'
import { encodeConnection } from '../encoder/Connection.js'
import { encodeMatrix } from '../encoder/Matrix.js'
import { encodeParameter } from '../encoder/Parameter.js'
import { encodeStreamDescription } from '../encoder/StreamDescription.js'
import { berDecode } from '../index.js'

// The BER and Glow encodings compared with Lawo's libember (github.com/Lawo/ember-plus, at 6bc294e): its BER codecs
// (libember/Headers/ember/ber/traits), the Glow DTD's tags and types (glow/GlowTags, GlowType and the enumerations)
// and what its accessors give for a field (glow/impl). The integer helpers port libember's coder for `long long`.
//
// A test marked `failing` states libember's behaviour where this library differs from it: it passes while the
// difference remains, and fails once the library behaves as libember does, to be made an ordinary test.

const hex = (s: string) => Buffer.from(s.replace(/ /g, ''), 'hex')

/** ber/traits/Integral.hpp, SignedEncodedLength and IntegerEncode for a `long long`: the shortest two's complement */
function libemberInteger(value: bigint): Buffer {
	let rest = value < 0n ? ~value : value
	let length = 1
	for (let i = 0; i < 8; i++) {
		length += rest > 0x7fn ? 1 : 0
		rest >>= 8n
	}
	const contents: number[] = []
	for (let bits = length * 8; bits > 0;) {
		bits -= 8
		contents.push(Number((value >> BigInt(bits)) & 0xffn))
	}
	return Buffer.from([Ber.BERDataTypes.INTEGER, length, ...contents])
}

/** ber/traits/Integral.hpp, IntegerDecodingTraits for a `long long`: the first byte's top bit is the sign */
function libemberReadInteger(tlv: Buffer): bigint {
	let value = 0n
	tlv.subarray(2, 2 + tlv[1]).forEach((byte, index) => {
		if (index === 0 && byte & 0x80) value = -1n
		value = BigInt.asIntN(64, (value << 8n) | BigInt(byte))
	})
	return value
}

/** Writes with a fresh writer and gives the bytes */
function written(write: (writer: Ber.Writer) => void): Buffer {
	const writer = new Ber.Writer()
	write(writer)
	return writer.buffer
}

/** The fields of an encoded SET or SEQUENCE: each context number's contents, the TLV inside the context tag */
function fields(encoded: Buffer, outer?: number): Map<number, Buffer> {
	const reader = new Ber.Reader(encoded)
	reader.readSequence(outer)
	const end = reader.offset + reader.length
	const result = new Map<number, Buffer>()
	while (reader.offset < end) {
		const tag = reader.readSequence()
		if (tag === null || tag === 0) continue
		const start = reader.offset
		const inner = reader.peek()
		if (inner === null) break
		reader.readStringAsBuffer(inner)
		result.set(tag & 0x1f, encoded.subarray(start, reader.offset))
	}
	return result
}
const intField = (encoded: Buffer, n: number, outer?: number) => {
	const field = fields(encoded, outer).get(n)
	return field && new Ber.Reader(field).readInt()
}

/** Contents of a SET or SEQUENCE: each field a context tag around the value the writer function writes */
function contents(outer: number, ...entries: Array<[number, (writer: Ber.Writer) => void]>): Buffer {
	return written((writer) => {
		writer.startSequence(outer)
		for (const [n, write] of entries) {
			writer.startSequence(Ber.CONTEXT(n))
			write(writer)
			writer.endSequence()
		}
		writer.endSequence()
	})
}
const int = (value: number) => (writer: Ber.Writer) => writer.writeInt(value)
const str = (value: string) => (writer: Ber.Writer) => writer.writeString(value, Ber.BERDataTypes.STRING)
const oid = (value: string) => (writer: Ber.Writer) => writer.writeRelativeOID(value, Ber.BERDataTypes.RELATIVE_OID)
const raw = (bytes: string) => (writer: Ber.Writer) => {
	for (const b of hex(bytes)) writer.writeByte(b)
}

const decodedParameter = (encoded: Buffer) => decodeParameter(new Ber.Reader(encoded)).value
const encodedParameter = (parameter: ParameterImpl) => written((writer) => encodeParameter(parameter, writer))

describe('BER and Glow compared with libember', () => {
	describe('as libember does', () => {
		// Values that fit in 32 bits, the edges of each length among them
		const thirtyTwoBit = [
			0, 1, -1, 127, 128, -128, -129, 255, 256, 32767, 32768, -32768, -32769, 0x7fffff, 0x800000, -0x800000,
			-0x800001, 0x7fffffff, -0x80000000,
		]

		it.each(thirtyTwoBit)('writes the integer %d in the fewest bytes, as libember does', (value) => {
			expect(written((w) => w.writeInt(value)).toString('hex')).toBe(
				libemberInteger(BigInt(value)).toString('hex')
			)
		})

		it.each(thirtyTwoBit)('reads the integer %d as libember does', (value) => {
			const tlv = libemberInteger(BigInt(value))
			expect(new Ber.Reader(tlv).readInt()).toBe(Number(libemberReadInteger(tlv)))
		})

		it('writes a boolean as one byte, 0xFF for true (ber/traits/Boolean.hpp)', () => {
			expect(written((w) => w.writeBoolean(true)).toString('hex')).toBe('0101ff')
			expect(written((w) => w.writeBoolean(false)).toString('hex')).toBe('010100')
		})

		it('reads any byte but zero as true (ber/traits/Boolean.hpp)', () => {
			expect(new Ber.Reader(hex('01 01 01')).readBoolean()).toBe(true)
			expect(new Ber.Reader(hex('01 01 80')).readBoolean()).toBe(true)
			expect(new Ber.Reader(hex('01 01 00')).readBoolean()).toBe(false)
		})

		// traits/Length.hpp writes a long length as an unsigned integer (Integral.hpp), with a leading zero byte when
		// the top bit of the first is set: 128 is 82 00 80. The library writes 81 80, which libember reads as well.
		it.each([
			[128, '82 00 80'],
			[255, '82 00 ff'],
			[0x8000, '83 00 80 00'],
		])('reads a length of %d in the form libember writes, %s', (length, form) => {
			const contents = Buffer.alloc(length, 0x61)
			const reader = new Ber.Reader(Buffer.concat([hex('04' + form), contents]))

			expect(reader.readStringAsBuffer(Ber.BERDataTypes.OCTETSTRING)).toEqual(contents)
		})

		// glow/GlowType.hpp: the APPLICATION tag number of each type
		it.each<[keyof typeof Constants, number]>([
			['RootBERID', 0],
			['ParameterBERID', 1],
			['CommandBERID', 2],
			['NodeBERID', 3],
			['ElementCollectionBERID', 4],
			['StreamEntryBERID', 5],
			['StreamEntriesBERID', 6],
			['StringIntegerPairBERID', 7],
			['StringIntegerCollectionBERID', 8],
			['QualifiedParameterBERID', 9],
			['QualifiedNodeBERID', 10],
			['RootElementsBERID', 11],
			['StreamDescriptionBERID', 12],
			['MatrixBERID', 13],
			['TargetBERID', 14],
			['SourceBERID', 15],
			['ConnectionBERID', 16],
			['QualifiedMatrixBERID', 17],
			['LabelBERID', 18],
			['FunctionBERID', 19],
			['QualifiedFunctionBERID', 20],
			['FunctionArgumentBERID', 21],
			['InvocationBERID', 22],
			['InvocationResultBERID', 23],
			['TemplateBERID', 24],
			['QualifiedTemplateBERID', 25],
		])('gives %s the tag [APPLICATION %d], as GlowType does', (name, number) => {
			expect(Constants[name]).toBe(Ber.APPLICATION(number))
		})

		// glow/ParameterType.hpp and Access.hpp; the parameter's fields type [13] and access [5]
		it.each<[ParameterType, number]>([
			[ParameterType.Null, 0],
			[ParameterType.Integer, 1],
			[ParameterType.Real, 2],
			[ParameterType.String, 3],
			[ParameterType.Boolean, 4],
			[ParameterType.Trigger, 5],
			[ParameterType.Enum, 6],
			[ParameterType.Octets, 7],
		])('codes the parameter type %s as %d', (type, number) => {
			expect(intField(encodedParameter(new ParameterImpl(type, 'p')), 13, Ber.BERDataTypes.SET)).toBe(number)
			expect(decodedParameter(contents(Ber.BERDataTypes.SET, [13, int(number)])).parameterType).toBe(type)
		})

		it.each<[ParameterAccess, number]>([
			[ParameterAccess.None, 0],
			[ParameterAccess.Read, 1],
			[ParameterAccess.Write, 2],
			[ParameterAccess.ReadWrite, 3],
		])('codes the parameter access %s as %d', (access, number) => {
			const parameter = new ParameterImpl(
				ParameterType.Integer,
				'p',
				undefined,
				undefined,
				undefined,
				undefined,
				access
			)
			expect(intField(encodedParameter(parameter), 5, Ber.BERDataTypes.SET)).toBe(number)
			expect(decodedParameter(contents(Ber.BERDataTypes.SET, [5, int(number)])).access).toBe(access)
		})

		// glow/MatrixType.hpp and MatrixAddressingMode.hpp; the matrix's fields type [2] and addressingMode [3]
		const decodedMatrixContents = (...entries: Array<[number, (writer: Ber.Writer) => void]>) =>
			decodeMatrix(
				new Ber.Reader(
					written((w) => {
						w.startSequence(Constants.MatrixBERID)
						w.startSequence(Ber.CONTEXT(0))
						w.writeInt(1)
						w.endSequence()
						w.startSequence(Ber.CONTEXT(1))
						for (const b of contents(Ber.BERDataTypes.SET, [0, str('m')], ...entries)) w.writeByte(b)
						w.endSequence()
						w.endSequence()
					})
				)
			).value.contents

		it.each<[MatrixType, number]>([
			[MatrixType.OneToN, 0],
			[MatrixType.OneToOne, 1],
			[MatrixType.NToN, 2],
		])('codes the matrix type %s as %d', (type, number) => {
			const encoded = written((w) =>
				encodeMatrix(new MatrixImpl('m', undefined, undefined, undefined, undefined, type), w)
			)
			expect(intField(encoded, 2, Ber.BERDataTypes.SET)).toBe(number)
			expect(decodedMatrixContents([2, int(number)]).matrixType).toBe(type)
		})

		it.each<[MatrixAddressingMode, number]>([
			[MatrixAddressingMode.Linear, 0],
			[MatrixAddressingMode.NonLinear, 1],
		])('codes the matrix addressing mode %s as %d', (mode, number) => {
			const matrix = new MatrixImpl('m', undefined, undefined, undefined, undefined, undefined, mode)
			expect(
				intField(
					written((w) => encodeMatrix(matrix, w)),
					3,
					Ber.BERDataTypes.SET
				)
			).toBe(number)
			expect(decodedMatrixContents([3, int(number)]).addressingMode).toBe(mode)
		})

		// glow/ConnectionOperation.hpp and ConnectionDisposition.hpp; the connection's fields [2] and [3]
		const decodedConnection = (...entries: Array<[number, (writer: Ber.Writer) => void]>) =>
			decodeConnection(new Ber.Reader(contents(Constants.ConnectionBERID, [0, int(1)], ...entries))).value

		it.each<[ConnectionOperation, number]>([
			[ConnectionOperation.Absolute, 0],
			[ConnectionOperation.Connect, 1],
			[ConnectionOperation.Disconnect, 2],
		])('codes the connection operation %s as %d', (operation, number) => {
			const encoded = written((w) => encodeConnection(new ConnectionImpl(1, [2], operation), w))
			expect(intField(encoded, 2, Constants.ConnectionBERID)).toBe(number)
			expect(decodedConnection([2, int(number)]).operation).toBe(operation)
		})

		it.each<[ConnectionDisposition, number]>([
			[ConnectionDisposition.Tally, 0],
			[ConnectionDisposition.Modified, 1],
			[ConnectionDisposition.Pending, 2],
			[ConnectionDisposition.Locked, 3],
		])('codes the connection disposition %s as %d', (disposition, number) => {
			const encoded = written((w) => encodeConnection(new ConnectionImpl(1, [2], undefined, disposition), w))
			expect(intField(encoded, 3, Constants.ConnectionBERID)).toBe(number)
			expect(decodedConnection([3, int(number)]).disposition).toBe(disposition)
		})

		// glow/CommandType.hpp
		it('numbers the commands as CommandType does', () => {
			expect([
				CommandType.Subscribe,
				CommandType.Unsubscribe,
				CommandType.GetDirectory,
				CommandType.Invoke,
			]).toEqual([30, 31, 32, 33])
		})

		// glow/DirFieldMask.hpp; the command's field dirFieldMask [1]
		it.each<[FieldFlags, number]>([
			[FieldFlags.Sparse, -2],
			[FieldFlags.All, -1],
			[FieldFlags.Default, 0],
			[FieldFlags.Identifier, 1],
			[FieldFlags.Description, 2],
			[FieldFlags.Tree, 3],
			[FieldFlags.Value, 4],
			[FieldFlags.Connections, 5],
		])('codes the dir field mask %s as %d', (mask, number) => {
			const encoded = written((w) => encodeCommand(new GetDirectoryImpl(mask), w))
			expect(intField(encoded, 0, Constants.CommandBERID)).toBe(32)
			expect(intField(encoded, 1, Constants.CommandBERID)).toBe(number)
			const decoded = decodeCommand(
				new Ber.Reader(contents(Constants.CommandBERID, [0, int(32)], [1, int(number)]))
			)
			expect(decoded.value).toMatchObject({ number: CommandType.GetDirectory, dirFieldMask: mask })
		})

		// glow/StreamFormat.hpp; the stream descriptor's field format [0]
		it.each<[StreamFormat, number]>([
			[StreamFormat.UInt8, 0],
			[StreamFormat.UInt16BE, 2],
			[StreamFormat.UInt16LE, 3],
			[StreamFormat.UInt32BE, 4],
			[StreamFormat.UInt32LE, 5],
			[StreamFormat.UInt64BE, 6],
			[StreamFormat.UInt64LE, 7],
			[StreamFormat.Int8, 8],
			[StreamFormat.Int16BE, 10],
			[StreamFormat.Int16LE, 11],
			[StreamFormat.Int32BE, 12],
			[StreamFormat.Int32LE, 13],
			[StreamFormat.Int64BE, 14],
			[StreamFormat.Int64LE, 15],
			[StreamFormat.Float32BE, 20],
			[StreamFormat.Float32LE, 21],
			[StreamFormat.Float64BE, 22],
			[StreamFormat.Float64LE, 23],
		])('codes the stream format %s as %d', (format, number) => {
			const encoded = written((w) => encodeStreamDescription(new StreamDescriptionImpl(format, 4), w))
			expect(intField(encoded, 0, Constants.StreamDescriptionBERID)).toBe(number)
			const decoded = decodeStreamDescription(
				new Ber.Reader(contents(Constants.StreamDescriptionBERID, [0, int(number)], [1, int(4)]))
			)
			expect(decoded.value).toEqual({ format, offset: 4 })
		})

		// glow/impl/GlowParameterBase.ipp, effectiveType(): a trigger stays a trigger; a parameter with an enumeration
		// or an enumeration map is an enum; otherwise the value's type decides, and without a value the type field
		it.each<[string, Buffer, ParameterType]>([
			[
				'a trigger with an integer value',
				contents(Ber.BERDataTypes.SET, [2, int(1)], [13, int(5)]),
				ParameterType.Trigger,
			],
			[
				'an integer parameter with an enumeration',
				contents(Ber.BERDataTypes.SET, [2, int(1)], [7, str('off\non')], [13, int(1)]),
				ParameterType.Enum,
			],
			[
				'an integer parameter with a real value',
				contents(Ber.BERDataTypes.SET, [2, (w) => w.writeReal(1.5, Ber.BERDataTypes.REAL)], [13, int(1)]),
				ParameterType.Real,
			],
			['a string value without a type', contents(Ber.BERDataTypes.SET, [2, str('a')]), ParameterType.String],
			['an octets parameter without a value', contents(Ber.BERDataTypes.SET, [13, int(7)]), ParameterType.Octets],
		])('gives %s the type libember gives it', (_, encoded, type) => {
			expect(decodedParameter(encoded).parameterType).toBe(type)
		})

		// The DTD: templateReference [18] RELATIVE-OID; libember's GlowParameterBase sets and reads it as a
		// ber::ObjectIdentifier, as it does the node's, matrix's and function's (#47)
		it("reads a parameter's template reference as a RELATIVE-OID", () => {
			const decoded = decodedParameter(contents(Ber.BERDataTypes.SET, [0, str('gain')], [18, oid('1.2')]))

			expect(decoded).toMatchObject({ identifier: 'gain', templateReference: '1.2' })
		})

		it("writes a parameter's template reference as a RELATIVE-OID", () => {
			const parameter = new ParameterImpl(ParameterType.Integer, 'gain')
			parameter.templateReference = '1.2'
			const field = fields(encodedParameter(parameter), Ber.BERDataTypes.SET).get(18)

			expect(field?.toString('hex')).toBe('0d020102')
		})

		it('decodes the rest of a message holding a parameter with a template reference', () => {
			const element =
				(path: string, ...entries: Array<[number, (writer: Ber.Writer) => void]>) =>
				(w: Ber.Writer) => {
					w.startSequence(Constants.QualifiedParameterBERID)
					w.startSequence(Ber.CONTEXT(0))
					w.writeRelativeOID(path, Ber.BERDataTypes.RELATIVE_OID)
					w.endSequence()
					w.startSequence(Ber.CONTEXT(1))
					for (const b of contents(Ber.BERDataTypes.SET, ...entries)) w.writeByte(b)
					w.endSequence()
					w.endSequence()
				}
			const message = written((w) => {
				w.startSequence(Constants.RootBERID)
				w.startSequence(Constants.RootElementsBERID)
				for (const write of [element('1', [0, str('a')]), element('2', [0, str('b')], [18, oid('1.2')])]) {
					w.startSequence(Ber.CONTEXT(0))
					write(w)
					w.endSequence()
				}
				w.endSequence()
				w.endSequence()
			})

			const decoded = Object.values<RootElement>(berDecode(message).value as Collection<RootElement>)
			expect(decoded.map((el) => 'path' in el && el.path)).toEqual(['1', '2'])
		})

		// The DTD: a value or limit is an Integer64; Integral.hpp codes a `long long` in up to eight bytes (#48). Exact
		// within the integers a number holds (±2^53).
		for (const value of [
			2 ** 31,
			2 ** 32 - 1,
			2 ** 32,
			-(2 ** 31) - 1,
			-(2 ** 32),
			2 ** 40 + 5,
			2 ** 53 - 1,
			-(2 ** 53 - 1),
		]) {
			const tlv = libemberInteger(BigInt(value))

			it(`writes the integer ${value} as libember does, ${tlv.toString('hex')}`, () => {
				expect(written((w) => w.writeInt(value)).toString('hex')).toBe(tlv.toString('hex'))
			})

			it(`reads the integer ${tlv.toString('hex')} as libember does, ${value}`, () => {
				expect(new Ber.Reader(tlv).readInt()).toBe(Number(libemberReadInteger(tlv)))
			})
		}

		it('writes and reads the 64-bit extremes as libember does', () => {
			for (const value of [-(2n ** 63n), 2n ** 63n - 1024n]) {
				const tlv = libemberInteger(value)
				expect(written((w) => w.writeInt(Number(value))).toString('hex')).toBe(tlv.toString('hex'))
				expect(new Ber.Reader(tlv).readInt()).toBe(Number(value))
			}
		})

		it('reads a parameter value of 2^32 - 1, which a 32-bit integer cannot hold', () => {
			const decoded = decodedParameter(contents(Ber.BERDataTypes.SET, [2, raw('02 05 00 ff ff ff ff')]))

			expect(decoded.value).toBe(2 ** 32 - 1)
		})

		// Glow 2.50 made a parameter's value nullable (#49). libember's glow::Value takes a NULL as having no type
		// (ParameterType::None), so effectiveType() falls back to the type field.
		it('keeps the type of a parameter whose value is null', () => {
			const decoded = decodedParameter(contents(Ber.BERDataTypes.SET, [2, raw('05 00')], [13, int(1)]))

			expect(decoded).toMatchObject({ parameterType: ParameterType.Integer, value: null })
		})

		it('gives a null value without a type field the type Null, with no error', () => {
			const decoded = decodeParameter(new Ber.Reader(contents(Ber.BERDataTypes.SET, [2, raw('05 00')])))

			expect(decoded.value).toMatchObject({ parameterType: ParameterType.Null, value: null })
			expect(decoded.errors).toEqual([])
		})

		// GlowParameterBase::setValue(ber::Null) and setDefault(ber::Null) write a NULL whatever the type
		for (const type of [
			ParameterType.Integer,
			ParameterType.Real,
			ParameterType.String,
			ParameterType.Boolean,
			ParameterType.Enum,
			ParameterType.Octets,
		]) {
			it(`writes a null value of a parameter of the type ${type} as a NULL`, () => {
				const parameter = new ParameterImpl(type, 'p', undefined, null as EmberValue)
				parameter.defaultValue = null

				const encoded = fields(encodedParameter(parameter), Ber.BERDataTypes.SET)
				expect(encoded.get(2)?.toString('hex')).toBe('0500')
				expect(encoded.get(12)?.toString('hex')).toBe('0500')
			})
		}

		// glow/impl/GlowInvocationResult.ipp: success() is true when the field is left out (#50)
		it('takes an invocation result without a success field as a success', () => {
			const decoded = decodeInvocationResult(
				new Ber.Reader(contents(Constants.InvocationResultBERID, [0, int(1)]))
			)

			expect(decoded.value.success).toBe(true)
		})

		it('reads an invocation result whose success field is false as a failure', () => {
			const decoded = decodeInvocationResult(
				new Ber.Reader(
					contents(Constants.InvocationResultBERID, [0, int(1)], [1, (w) => w.writeBoolean(false)])
				)
			)

			expect(decoded.value.success).toBe(false)
		})
	})

	describe('where the library differs from libember', () => {
		// The DTD's Value is an integer, real, string, boolean, octets or null; libember's Value writes an enum's
		// value as the integer it is (ParameterType has no BER type of its own). The library writes an argument or
		// result of the type Enum with the tag ENUMERATED, which libember reads as no value it knows, and the library
		// itself can't read back.
		it.failing('writes a value of the type Enum as an INTEGER', () => {
			expect(written((w) => w.writeValue({ type: ParameterType.Enum, value: 2 })).toString('hex')).toBe('020102')
		})

		// glow/impl/GlowCommand.ipp: number() is CommandType::None when the field is left out, and a number it doesn't
		// know stays that number, which a provider then doesn't act on. The library takes either for a Subscribe.
		it.failing('does not take a command it does not know (34) for a Subscribe', () => {
			const decoded = decodeCommand(new Ber.Reader(contents(Constants.CommandBERID, [0, int(34)])))

			expect(decoded.value.number).not.toBe(CommandType.Subscribe)
		})

		it.failing('does not take a command without a number for a Subscribe', () => {
			const decoded = decodeCommand(new Ber.Reader(hex('62 00')))

			expect(decoded.value.number).not.toBe(CommandType.Subscribe)
		})

		// glow/impl/GlowParameterBase.ipp: access() keeps a value it doesn't know, and isWriteable() is true only for
		// writeOnly (2) and readWrite (3). The library substitutes readWrite for a value it doesn't know.
		it.failing('does not take an access value it does not know (7) as writeable', () => {
			const decoded = decodedParameter(contents(Ber.BERDataTypes.SET, [5, int(7)]))

			expect([ParameterAccess.Write, ParameterAccess.ReadWrite]).not.toContain(decoded.access)
		})

		// glow/impl/GlowStringIntegerPair.ipp: name() is "" when the field is left out. The library makes up a name.
		it.failing('names an enumeration map entry without a name ""', () => {
			const pair = contents(Constants.StringIntegerPairBERID, [1, int(3)])
			const collection = written((w) => {
				w.startSequence(Constants.StringIntegerCollectionBERID)
				w.startSequence(Ber.CONTEXT(0))
				for (const b of pair) w.writeByte(b)
				w.endSequence()
				w.endSequence()
			})

			expect([...decodeStringIntegerCollection(new Ber.Reader(collection)).value]).toEqual([['', 3]])
		})

		// ber/traits/Integral.hpp reads an INTEGER without contents as 0. The library reads the byte after it for the
		// sign, so it gives -1 when that byte's top bit is set.
		it.failing('reads an INTEGER without contents as 0', () => {
			expect(new Ber.Reader(hex('02 00 a1 00')).readInt()).toBe(0)
		})

		// ber/traits/Boolean.hpp reads the first contents byte only. The library reads them all as an integer.
		it.failing('reads a BOOLEAN from its first contents byte', () => {
			expect(new Ber.Reader(hex('01 02 00 01')).readBoolean()).toBe(false)
		})

		// ber/traits/Length.hpp reads as many length bytes as the length's first byte gives. The library refuses more
		// than four, as `encoding too long`.
		it.failing('reads a length given in five bytes', () => {
			const reader = new Ber.Reader(hex('04 85 00 00 00 00 03 61 62 63'))

			expect(reader.readStringAsBuffer(Ber.BERDataTypes.OCTETSTRING)?.toString()).toBe('abc')
		})
	})
})
