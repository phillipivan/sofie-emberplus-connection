import * as Ber from '../../../Ber/index.js'
import { Connection, ConnectionDisposition, ConnectionOperation } from '../../../model/Connection.js'
import { ElementType } from '../../../model/EmberElement.js'
import {
	connectionsOf,
	Matrix,
	MatrixAddressingMode,
	MatrixImpl,
	MatrixType,
	signalsOf,
} from '../../../model/Matrix.js'
import { NumberedTreeNode, NumberedTreeNodeImpl, QualifiedElement, QualifiedElementImpl } from '../../../model/Tree.js'
import { RelativeOID, RootElement } from '../../../types/types.js'
import { defaultDecode, guarded } from '../decoder/DecodeResult.js'
import { decodeMatrix } from '../decoder/Matrix.js'
import { decodeGenericElement } from '../decoder/Tree.js'
import { encodeQualifedElement } from '../encoder/Qualified.js'
import { encodeNumberedElement } from '../encoder/Tree.js'
import { berDecode } from '../index.js'
import { toIndefiniteLength } from './indefiniteLength.js'

describe('encodings/ber/Matrix', () => {
	function roundtripMatrix(matrix: Matrix, qualified = false, indefinite = false): void {
		const node = qualified ? new QualifiedElementImpl('1.2.3', matrix) : new NumberedTreeNodeImpl(0, matrix)
		const writer = new Ber.Writer()
		if (!qualified) encodeNumberedElement(node as NumberedTreeNode<Matrix>, writer)
		else encodeQualifedElement(node as QualifiedElement<Matrix>, writer)
		expect(writer.buffer.length).toBeGreaterThan(0)
		const buffer = indefinite ? toIndefiniteLength(writer.buffer) : writer.buffer
		if (indefinite) expect(buffer[1]).toBe(0x80)
		const reader = new Ber.Reader(buffer)
		const decoded = guarded(decodeMatrix(reader, qualified))

		expect(decoded).toEqual(node)
	}

	function runRoundtripTests(qualified: boolean): void {
		test('identifier', () => {
			const matrix: Matrix = new MatrixImpl('identifier')
			roundtripMatrix(matrix, qualified)
		})
		test('targets', () => {
			const matrix: Matrix = new MatrixImpl('identifier')
			matrix.targets = signalsOf([0, 1, 2, 3, 4])
			roundtripMatrix(matrix, qualified)
		})
		test('sources', () => {
			const matrix: Matrix = new MatrixImpl('identifier')
			matrix.sources = signalsOf([0, 1, 2, 3, 4])
			roundtripMatrix(matrix, qualified)
		})
		test('signal contents', () => {
			const matrix: Matrix = new MatrixImpl('identifier')
			matrix.targets = new Map([
				[0, { identifier: 'out-0', isOnline: false, labelsLocation: '1.9.0' }],
				[1, {}],
				[2, { isOnline: true }],
			])
			matrix.sources = new Map([
				[5, {}],
				[6, { labelsLocation: '1.8.6' }],
			])
			roundtripMatrix(matrix, qualified)
		})
		test('connections', () => {
			const matrix: Matrix = new MatrixImpl('identifier')
			matrix.connections = connectionsOf([
				{
					target: 1,
				},
			])
			roundtripMatrix(matrix, qualified)
		})
		describe('connections', () => {
			test('sources', () => {
				const matrix: Matrix = new MatrixImpl('identifier')
				matrix.connections = connectionsOf([
					{
						target: 1,
						sources: [2, 3],
					},
				])
				roundtripMatrix(matrix, qualified)
			})
			test('operation', () => {
				const matrix: Matrix = new MatrixImpl('identifier')
				matrix.connections = connectionsOf([
					{
						target: 1,
						operation: ConnectionOperation.Absolute,
					},
				])
				roundtripMatrix(matrix, qualified)
				matrix.connections = connectionsOf([
					{
						target: 1,
						operation: ConnectionOperation.Connect,
					},
				])
				roundtripMatrix(matrix, qualified)
				matrix.connections = connectionsOf([
					{
						target: 1,
						operation: ConnectionOperation.Disconnect,
					},
				])
				roundtripMatrix(matrix, qualified)
			})
			test('disposition', () => {
				const matrix: Matrix = new MatrixImpl('identifier')
				const connection: Connection = { target: 1, disposition: ConnectionDisposition.Locked }
				matrix.connections = connectionsOf([connection])
				roundtripMatrix(matrix, qualified)
				connection.disposition = ConnectionDisposition.Modified
				roundtripMatrix(matrix, qualified)
				connection.disposition = ConnectionDisposition.Pending
				roundtripMatrix(matrix, qualified)
				connection.disposition = ConnectionDisposition.Tally
				roundtripMatrix(matrix, qualified)
			})
		})
		test('description', () => {
			const matrix: Matrix = new MatrixImpl('identifier')
			matrix.description = 'Display Name'
			roundtripMatrix(matrix, qualified)
		})
		test('matrixType', () => {
			const matrix: Matrix = new MatrixImpl('identifier')
			matrix.matrixType = MatrixType.NToN
			roundtripMatrix(matrix, qualified)
			matrix.matrixType = MatrixType.OneToN
			roundtripMatrix(matrix, qualified)
			matrix.matrixType = MatrixType.OneToOne
			roundtripMatrix(matrix, qualified)
		})
		test('addressingMode', () => {
			const matrix: Matrix = new MatrixImpl('identifier')
			matrix.addressingMode = MatrixAddressingMode.Linear
			roundtripMatrix(matrix, qualified)
			matrix.addressingMode = MatrixAddressingMode.NonLinear
			roundtripMatrix(matrix, qualified)
		})
		test('targetCount', () => {
			const matrix: Matrix = new MatrixImpl('identifier')
			matrix.targetCount = 5
			roundtripMatrix(matrix, qualified)
		})
		test('sourceCount', () => {
			const matrix: Matrix = new MatrixImpl('identifier')
			matrix.sourceCount = 5
			roundtripMatrix(matrix, qualified)
		})
		test('maximumTotalConnects', () => {
			const matrix: Matrix = new MatrixImpl('identifier')
			matrix.maximumTotalConnects = 25
			roundtripMatrix(matrix, qualified)
		})
		test('maximumConnectsPerTarget', () => {
			const matrix: Matrix = new MatrixImpl('identifier')
			matrix.maximumConnectsPerTarget = 5
			roundtripMatrix(matrix, qualified)
		})
		test('parametersLocation', () => {
			const matrix: Matrix = new MatrixImpl('identifier')
			matrix.parametersLocation = '1.2.3'
			roundtripMatrix(matrix, qualified)
		})
		// ParametersLocation ::= CHOICE { basePath [0] RELATIVE-OID, inline [1] Integer32 }: a base path of one or
		// two parts is still a path, not the inline number it happens to look like
		test.each<RelativeOID>(['1.2', '5', ''])('parametersLocation base path %j', (basePath) => {
			const matrix: Matrix = new MatrixImpl('identifier')
			matrix.parametersLocation = basePath
			roundtripMatrix(matrix, qualified)
		})
		test('parametersLocation inline', () => {
			const matrix: Matrix = new MatrixImpl('identifier')
			matrix.parametersLocation = 7
			roundtripMatrix(matrix, qualified)
		})
		test('gainParameterNumber', () => {
			const matrix: Matrix = new MatrixImpl('identifier')
			matrix.gainParameterNumber = 3
			roundtripMatrix(matrix, qualified)
		})
		test('labels', () => {
			const matrix: Matrix = new MatrixImpl('identifier')
			matrix.labels = [{ basePath: '1.2.3', description: 'Descr' }]
			roundtripMatrix(matrix, qualified)
		})
		test('schemaIdentifiers', () => {
			const matrix: Matrix = new MatrixImpl('identifier')
			matrix.schemaIdentifiers = '1.2.3'
			roundtripMatrix(matrix, qualified)
		})
		test('templateReference', () => {
			const matrix: Matrix = new MatrixImpl('identifier')
			matrix.templateReference = '1.2.3'
			roundtripMatrix(matrix, qualified)
		})
	}

	// In the indefinite length form every container ends with a 00 00 end-of-contents marker, which the
	// decoder loops meet after each entry. The lists have several entries because a marker used to make
	// the connections loop skip the entry after it.
	function runIndefiniteLengthTests(qualified: boolean): void {
		test('multiple labels', () => {
			const matrix: Matrix = new MatrixImpl('identifier')
			matrix.labels = [
				{ basePath: '1.2.3', description: 'Primary' },
				{ basePath: '1.2.4', description: 'Secondary' },
			]
			roundtripMatrix(matrix, qualified, true)
		})
		test('multiple targets', () => {
			const matrix: Matrix = new MatrixImpl('identifier')
			matrix.targets = signalsOf([0, 1, 2, 3, 4])
			roundtripMatrix(matrix, qualified, true)
		})
		test('multiple sources', () => {
			const matrix: Matrix = new MatrixImpl('identifier')
			matrix.sources = signalsOf([0, 1, 2, 3, 4])
			roundtripMatrix(matrix, qualified, true)
		})
		test('multiple connections', () => {
			const matrix: Matrix = new MatrixImpl('identifier')
			matrix.connections = connectionsOf([
				{ target: 0, sources: [1] },
				{ target: 1, sources: [2] },
				{ target: 2, sources: [0, 3] },
			])
			roundtripMatrix(matrix, qualified, true)
		})
		test('all lists', () => {
			const matrix: Matrix = new MatrixImpl('identifier')
			matrix.matrixType = MatrixType.OneToN
			matrix.addressingMode = MatrixAddressingMode.NonLinear
			matrix.targetCount = 3
			matrix.sourceCount = 4
			matrix.labels = [
				{ basePath: '1.2.3', description: 'Primary' },
				{ basePath: '1.2.4', description: 'Secondary' },
			]
			matrix.targets = signalsOf([0, 1, 2])
			matrix.sources = signalsOf([0, 1, 2, 3])
			matrix.connections = connectionsOf([
				{ target: 0, sources: [1] },
				{ target: 1, sources: [2] },
				{ target: 2, sources: [3] },
			])
			roundtripMatrix(matrix, qualified, true)
		})
	}

	describe('roundtrip numbered Matrix', () => {
		runRoundtripTests(false)
	})
	describe('roundtrip qualified Matrix', () => {
		runRoundtripTests(true)
	})
	describe('roundtrip numbered Matrix, indefinite length', () => {
		runIndefiniteLengthTests(false)
	})
	describe('roundtrip qualified Matrix, indefinite length', () => {
		runIndefiniteLengthTests(true)
	})

	// Packets captured from a test device, which uses the indefinite length form for every container.
	// The targets and sources reports carry no matrix contents, which the Glow DTD makes optional.
	describe('packets captured from a test device', () => {
		// reply to a GetDirectory on node 0.5: a labels node and the matrix description
		const description =
			'60806b80a0806a80a0050d03000501a1803180a0080c066c6162656c730000000000000000a0807180a0050d03000502a1803180a0080c066d6174726978a303020101a403020104a503020104aa803080a0807280a0050d03000501a1090c075072696d6172790000000000000000000000000000000000000000'
		const targets =
			'60806b80a0807180a0050d03000502a3803080a0806e80a00302010a00000000a0806e80a00302010b00000000a0806e80a00302010c00000000a0806e80a00302010d00000000000000000000000000000000'
		const sources =
			'60806b80a0807180a0050d03000502a4803080a0806f80a004020200aa00000000a0806f80a004020200ab00000000a0806f80a004020200ac00000000a0806f80a004020200ad00000000000000000000000000000000'

		function decodeMatrixAt(hex: string, path: string): Matrix {
			const root = berDecode(Buffer.from(hex, 'hex')).value as Array<RootElement>
			const element = root.find((el) => 'path' in el && el.path === path)
			expect(element?.contents.type).toBe(ElementType.Matrix)
			return element?.contents as Matrix
		}

		test('matrix description with a label', () => {
			expect(decodeMatrixAt(description, '0.5.2')).toMatchObject({
				identifier: 'matrix',
				addressingMode: MatrixAddressingMode.NonLinear,
				targetCount: 4,
				sourceCount: 4,
				labels: [{ basePath: '0.5.1', description: 'Primary' }],
			})
		})
		test('targets', () => {
			expect(decodeMatrixAt(targets, '0.5.2').targets).toEqual(signalsOf([10, 11, 12, 13]))
		})
		test('sources', () => {
			expect(decodeMatrixAt(sources, '0.5.2').sources).toEqual(signalsOf([170, 171, 172, 173]))
		})
		// The decoder gave a matrix without contents the identifier '', which a consumer then had to tell from a
		// real one, so as not to replace the identifier it had
		test('a report without contents has no identifier, and no errors', () => {
			expect(berDecode(Buffer.from(targets, 'hex')).errors).toEqual([])
			expect(decodeMatrixAt(targets, '0.5.2').identifier).toBeUndefined()
		})
	})

	describe('contents without the identifier they require', () => {
		const message = () => {
			const writer = new Ber.Writer()
			encodeQualifedElement(
				new QualifiedElementImpl<Matrix>('1.1', { type: ElementType.Matrix, description: 'router' }),
				writer
			)
			return new Ber.Reader(writer.buffer)
		}
		test('decode with an error, and no identifier made up', () => {
			const decoded = decodeMatrix(message(), true)

			expect(decoded.value.contents).toEqual(new MatrixImpl(undefined, undefined, undefined, undefined, 'router'))
			expect(decoded.errors.map((e) => e.message)).toEqual([
				"decode matrix contents: For required property 'identifier', value is missing.",
			])
		})
		test('throw when a required property is not to be substituted', () => {
			expect(() => decodeMatrix(message(), true, { ...defaultDecode, substituteForRequired: false })).toThrow(
				"For required property 'identifier', value is missing."
			)
		})
		// The element decoder, which decodes a message's elements, gave a matrix the default options, not its own
		test('throw so in a message too', () => {
			expect(() => decodeGenericElement(message(), { ...defaultDecode, substituteForRequired: false })).toThrow(
				"For required property 'identifier', value is missing."
			)
		})
	})

	// Glow 2.50: Signal ::= SEQUENCE { number [0] Integer32, contents [1] SignalContents OPTIONAL }, where
	// SignalContents ::= SET { identifier [0] EmberString OPTIONAL, isOnline [1] BOOLEAN OPTIONAL,
	// labelsLocation [2] RELATIVE-OID OPTIONAL }. The model holds each signal's contents by its number.
	describe('targets and sources with signal contents', () => {
		// A QualifiedMatrix 1.1 with two targets and two sources, each first one with contents, and a connection
		function matrixWithSignalContents(): Buffer {
			const w = new Ber.Writer()
			const signal = (tag: number, number: number, contents?: { identifier: string; labelsLocation: string }) => {
				w.startSequence(Ber.CONTEXT(0))
				w.startSequence(tag)
				w.startSequence(Ber.CONTEXT(0))
				w.writeInt(number)
				w.endSequence()
				if (contents) {
					w.startSequence(Ber.CONTEXT(1))
					w.startSequence(Ber.BERDataTypes.SET)
					w.startSequence(Ber.CONTEXT(0))
					w.writeString(contents.identifier, Ber.BERDataTypes.STRING)
					w.endSequence()
					w.startSequence(Ber.CONTEXT(1))
					w.writeBoolean(true)
					w.endSequence()
					w.startSequence(Ber.CONTEXT(2))
					w.writeRelativeOID(contents.labelsLocation, Ber.BERDataTypes.RELATIVE_OID)
					w.endSequence()
					w.endSequence()
					w.endSequence()
				}
				w.endSequence()
				w.endSequence()
			}

			w.startSequence(Ber.APPLICATION(17)) // QualifiedMatrix
			w.startSequence(Ber.CONTEXT(0))
			w.writeRelativeOID('1.1', Ber.BERDataTypes.RELATIVE_OID)
			w.endSequence()
			w.startSequence(Ber.CONTEXT(3)) // targets
			w.startSequence(Ber.BERDataTypes.SEQUENCE)
			signal(Ber.APPLICATION(14), 10, { identifier: 'target-10', labelsLocation: '1.9.10' })
			signal(Ber.APPLICATION(14), 20)
			w.endSequence()
			w.endSequence()
			w.startSequence(Ber.CONTEXT(4)) // sources
			w.startSequence(Ber.BERDataTypes.SEQUENCE)
			signal(Ber.APPLICATION(15), 1, { identifier: 'source-1', labelsLocation: '1.8.1' })
			signal(Ber.APPLICATION(15), 2)
			w.endSequence()
			w.endSequence()
			w.startSequence(Ber.CONTEXT(5)) // connections
			w.startSequence(Ber.BERDataTypes.SEQUENCE)
			w.startSequence(Ber.CONTEXT(0))
			w.startSequence(Ber.APPLICATION(16))
			w.startSequence(Ber.CONTEXT(0))
			w.writeInt(10)
			w.endSequence()
			w.startSequence(Ber.CONTEXT(1))
			w.writeRelativeOID('2', Ber.BERDataTypes.RELATIVE_OID)
			w.endSequence()
			w.endSequence()
			w.endSequence()
			w.endSequence()
			w.endSequence()
			w.endSequence()
			return w.buffer
		}

		test.each([
			['definite', (buffer: Buffer) => buffer],
			['indefinite', toIndefiniteLength],
		])('are decoded with their contents, by number, with %s lengths', (_, encode) => {
			const decoded = decodeMatrix(new Ber.Reader(encode(matrixWithSignalContents())), true)

			expect(decoded.errors).toEqual([])
			const expected = new MatrixImpl(
				undefined,
				new Map([
					[10, { identifier: 'target-10', isOnline: true, labelsLocation: '1.9.10' }],
					[20, {}],
				]),
				new Map([
					[1, { identifier: 'source-1', isOnline: true, labelsLocation: '1.8.1' }],
					[2, {}],
				]),
				connectionsOf([{ target: 10, sources: [2] }])
			)
			expect(decoded.value.contents).toEqual(expected)
		})

		// Not contents of the matrix: none are written for them (which a decoder would read as contents without the
		// identifier they require)
		test('are written without contents of the matrix', () => {
			const writer = new Ber.Writer()
			const matrix = new QualifiedElementImpl<Matrix>('1.1', {
				type: ElementType.Matrix,
				targets: new Map([[3, { identifier: 'out-3' }]]),
			})
			encodeQualifedElement(matrix, writer)
			const decoded = decodeMatrix(new Ber.Reader(writer.buffer), true)

			expect(decoded.errors).toEqual([])
			expect(decoded.value.contents.identifier).toBeUndefined()
			expect(decoded.value.contents.targets).toEqual(new Map([[3, { identifier: 'out-3' }]]))
		})

		test('with a field the DTD does not define: an error, and the rest kept', () => {
			const w = new Ber.Writer()
			w.startSequence(Ber.APPLICATION(17)) // QualifiedMatrix
			w.startSequence(Ber.CONTEXT(0))
			w.writeRelativeOID('1.1', Ber.BERDataTypes.RELATIVE_OID)
			w.endSequence()
			w.startSequence(Ber.CONTEXT(3)) // targets
			w.startSequence(Ber.BERDataTypes.SEQUENCE)
			w.startSequence(Ber.CONTEXT(0))
			w.startSequence(Ber.APPLICATION(14))
			w.startSequence(Ber.CONTEXT(0))
			w.writeInt(4)
			w.endSequence()
			w.startSequence(Ber.CONTEXT(1))
			w.startSequence(Ber.BERDataTypes.SET)
			w.startSequence(Ber.CONTEXT(7)) // not in SignalContents
			w.writeInt(1)
			w.endSequence()
			w.startSequence(Ber.CONTEXT(0))
			w.writeString('out-4', Ber.BERDataTypes.STRING)
			w.endSequence()
			w.endSequence()
			w.endSequence()
			w.endSequence()
			w.endSequence()
			w.endSequence()
			w.endSequence()
			w.endSequence()
			const decoded = decodeMatrix(new Ber.Reader(w.buffer), true)

			expect(decoded.value.contents.targets).toEqual(new Map([[4, { identifier: 'out-4' }]]))
			expect(decoded.errors.map((e) => e.message)).toEqual([
				"decode targets contents: Unexpected BER context tag '167'",
			])
		})

		// Connections are a SEQUENCE OF Connection, so a target can come twice: the later is kept, with an error
		test('a connection for a target listed twice is kept once, with an error', () => {
			const w = new Ber.Writer()
			const connection = (target: number, sources: string) => {
				w.startSequence(Ber.CONTEXT(0))
				w.startSequence(Ber.APPLICATION(16))
				w.startSequence(Ber.CONTEXT(0))
				w.writeInt(target)
				w.endSequence()
				w.startSequence(Ber.CONTEXT(1))
				w.writeRelativeOID(sources, Ber.BERDataTypes.RELATIVE_OID)
				w.endSequence()
				w.endSequence()
				w.endSequence()
			}
			w.startSequence(Ber.APPLICATION(17)) // QualifiedMatrix
			w.startSequence(Ber.CONTEXT(0))
			w.writeRelativeOID('1.1', Ber.BERDataTypes.RELATIVE_OID)
			w.endSequence()
			w.startSequence(Ber.CONTEXT(5)) // connections
			w.startSequence(Ber.BERDataTypes.SEQUENCE)
			connection(2, '1')
			connection(4, '1')
			connection(2, '3')
			w.endSequence()
			w.endSequence()
			w.endSequence()
			const decoded = decodeMatrix(new Ber.Reader(w.buffer), true)

			expect([...(decoded.value.contents.connections?.entries() ?? [])]).toEqual([
				[2, { target: 2, sources: [3] }],
				[4, { target: 4, sources: [1] }],
			])
			expect(decoded.errors.map((e) => e.message)).toEqual([
				'decode connections: target 2 is listed more than once',
			])
		})

		// The collection is a SEQUENCE OF Target, so a number can come twice: it is kept once, the later contents
		// taking the earlier's place, with an error
		test('a number listed twice is kept once, with an error', () => {
			const w = new Ber.Writer()
			const target = (number: number, identifier?: string) => {
				w.startSequence(Ber.CONTEXT(0))
				w.startSequence(Ber.APPLICATION(14))
				w.startSequence(Ber.CONTEXT(0))
				w.writeInt(number)
				w.endSequence()
				if (identifier !== undefined) {
					w.startSequence(Ber.CONTEXT(1))
					w.startSequence(Ber.BERDataTypes.SET)
					w.startSequence(Ber.CONTEXT(0))
					w.writeString(identifier, Ber.BERDataTypes.STRING)
					w.endSequence()
					w.endSequence()
					w.endSequence()
				}
				w.endSequence()
				w.endSequence()
			}
			w.startSequence(Ber.APPLICATION(17)) // QualifiedMatrix
			w.startSequence(Ber.CONTEXT(0))
			w.writeRelativeOID('1.1', Ber.BERDataTypes.RELATIVE_OID)
			w.endSequence()
			w.startSequence(Ber.CONTEXT(3)) // targets
			w.startSequence(Ber.BERDataTypes.SEQUENCE)
			target(1)
			target(7, 'first')
			target(7, 'second')
			w.endSequence()
			w.endSequence()
			w.endSequence()
			const decoded = decodeMatrix(new Ber.Reader(w.buffer), true)

			expect(decoded.value.contents.targets).toEqual(
				new Map([
					[1, {}],
					[7, { identifier: 'second' }],
				])
			)
			expect(decoded.errors.map((e) => e.message)).toEqual(['decode targets: target 7 is listed more than once'])
		})
	})
})
