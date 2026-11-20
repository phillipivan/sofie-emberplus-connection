import S101ClientMock from '../../../__mocks__/S101Client.js'
import * as Ber from '../../../Ber/index.js'
import { DecodeResult } from '../../../encodings/ber/decoder/DecodeResult.js'
import { berDecode, berEncode } from '../../../encodings/ber/index.js'
import { at } from '../../../lib/at.js'
import { CommandType } from '../../../model/Command.js'
import { Connection, ConnectionDisposition, ConnectionImpl, ConnectionOperation } from '../../../model/Connection.js'
import {
	Children,
	childrenOf,
	Connections,
	connectionsOf,
	ElementType,
	EmberElement,
	EmberFunctionImpl,
	EmberNodeImpl,
	FunctionArgumentImpl,
	isQualified,
	Matrix,
	MatrixAddressingMode,
	MatrixImpl,
	MatrixType,
	NumberedTreeNode,
	NumberedTreeNodeImpl,
	ParameterImpl,
	ParameterType,
	QualifiedElement,
	QualifiedElementImpl,
	signalsOf,
	StreamFormat,
	TemplateImpl,
	TreeElement,
} from '../../../model/index.js'
import { InvocationResultImpl } from '../../../model/InvocationResult.js'
import { LabelImpl, LabelSet } from '../../../model/Label.js'
import { Parameter, ParameterAccess, TypedParameter } from '../../../model/Parameter.js'
import { StreamDescriptionImpl } from '../../../model/StreamDescription.js'
import { StreamEntry, StreamEntryImpl } from '../../../model/StreamEntry.js'
import { EmberTypedValue, EmberValue, RelativeOID, Root, RootElement, RootType } from '../../../types/types.js'
import { EmberClient, EmberClientOptions } from '../index.js'

// import { EmberTreeNode, RootElement } from '../../../types/types.js'
// import { ElementType, EmberElement } from '../../../model/EmberElement.js'
// import { Parameter, ParameterType } from '../../../model/Parameter.js'

vi.mock('../../Socket/S101Client.js', async () => import('../../../__mocks__/S101Client.js'))

/** An element's child, which the test has made: throws if there isn't one */
function childOf(node: TreeElement<EmberElement>, number: number): NumberedTreeNode<EmberElement> {
	const child = node.children?.get(number)
	if (!child) throw new Error(`Expected a child ${number}`)
	return child
}

/** The device the test put at the top of the client's tree, as 1 */
function device(client: EmberClient): NumberedTreeNode<EmberElement> {
	const top = client.tree.get(1)
	if (!top) throw new Error('Expected a device, 1')
	return top
}

/** The first element of a message the client sent */
function firstElement(data: Buffer): RootElement {
	const decoded = berDecode(data)
	if (decoded.rootType !== RootType.Elements) throw new Error('Expected elements')
	return at(decoded.value, 0)
}

describe('client', () => {
	const onSocketCreate = vi.fn()
	const onConnection = vi.fn()
	const onSocketClose = vi.fn()
	const onSocketWrite = vi.fn<(data: Buffer) => boolean | undefined>()
	const onConnectionChanged = vi.fn()

	function setupSocketMock() {
		S101ClientMock.mockOnNextSocket((socket: any) => {
			onSocketCreate()

			socket.onConnect = onConnection
			socket.onWrite = onSocketWrite
			socket.onClose = onSocketClose
		})
	}

	beforeEach(() => {
		setupSocketMock()
	})
	afterEach(() => {
		const sockets = S101ClientMock.openSockets()
		// Destroy any lingering sockets, to prevent a failing test from affecting other tests:
		sockets.forEach((s) => s.destroy())

		S101ClientMock.clearMockOnNextSocket()
		onSocketCreate.mockClear()
		onConnection.mockClear()
		onSocketClose.mockClear()
		onSocketWrite.mockClear()
		onConnectionChanged.mockClear()

		// Just a check to ensure that the unit tests cleaned up the socket after themselves:

		// vitest/no-standalone-expect
		// eslint-disable-next-line
		expect(sockets).toHaveLength(0)
	})

	async function runWithConnection(
		fn: (connection: EmberClient, socket: S101ClientMock) => Promise<void>,
		options?: EmberClientOptions
	) {
		const client = new EmberClient('test', 9000, options)
		try {
			expect(client).toBeTruthy()

			await client.connect()

			// Wait for connection
			await new Promise(setImmediate)

			// Should be connected
			expect(client.connected).toBeTruthy()

			const sockets = S101ClientMock.openSockets()
			expect(sockets).toHaveLength(1)
			expect(onSocketWrite).toHaveBeenCalledTimes(0)

			await fn(client, at(sockets, 0))
		} finally {
			// Ensure cleaned up
			await client.disconnect()
			client.discard()

			await new Promise(setImmediate)
		}
	}

	function createQualifiedNodeResponse(
		path: RelativeOID,
		content: EmberElement,
		children: Children | undefined
	): DecodeResult<Root> {
		const parent = new QualifiedElementImpl<EmberElement>(path, content, children)

		const fixLevel = (node: NumberedTreeNode<EmberElement>, parent: NumberedTreeNode<EmberElement>) => {
			node.parent = parent

			for (const child of node.children?.values() ?? []) {
				fixLevel(child, node)
			}
		}
		if (children) {
			for (const child of children.values()) {
				fixLevel(child, parent as any as NumberedTreeNode<EmberElement>)
			}
		}
		return {
			value: [parent as Exclude<RootElement, NumberedTreeNode<EmberElement>>],
			errors: [],
		}
	}

	function createStreamParameter(opts: {
		identifier: string
		streamId: number
		value?: number
		offset?: number
		format?: StreamFormat
	}) {
		return new ParameterImpl(
			ParameterType.Real,
			opts.identifier,
			undefined, // description
			opts.value ?? 0.0,
			undefined, // maximum
			undefined, // minimum
			undefined, // access
			undefined, // format
			undefined, // enumeration
			undefined, // factor
			undefined, // isOnline
			undefined, // formula
			undefined, // step
			undefined, // defaultValue
			opts.streamId,
			undefined, // enumMap
			new StreamDescriptionImpl(opts.format ?? StreamFormat.Float32LE, opts.offset ?? 0)
		)
	}

	function createStreamEntryResponse(entries: Array<{ identifier: number; value: EmberTypedValue }>) {
		return {
			value: entries.map((entry) => new StreamEntryImpl(entry.identifier, entry.value)),
		}
	}

	it('getDirectory resolves', async () => {
		await runWithConnection(async (client, socket) => {
			// Do initial load
			const getRootDirReq = await client.getDirectory(client.tree)
			getRootDirReq.response?.catch(() => null) // Ensure uncaught response is ok
			expect(onSocketWrite).toHaveBeenCalledTimes(1)
			// TODO: should the value of the call be checked?

			// Mock a valid response
			socket.mockData({
				value: [new NumberedTreeNodeImpl(1, new EmberNodeImpl('Ruby', undefined, undefined, true))],
			})

			// Should have a response
			const res = (await getRootDirReq.response) as NumberedTreeNodeImpl<EmberElement>
			expect(res).toMatchObject(
				new NumberedTreeNodeImpl(1, new EmberNodeImpl('Ruby', undefined, undefined, true))
			)
		})
	})

	it('getElementByPath', async () => {
		await runWithConnection(async (client, socket) => {
			// Do initial load
			const getRootDirReq = await client.getDirectory(client.tree)
			getRootDirReq.response?.catch(() => null) // Ensure uncaught response is ok
			expect(onSocketWrite).toHaveBeenCalledTimes(1)
			onSocketWrite.mockClear()

			// Mock a valid response
			socket.mockData({
				value: [new NumberedTreeNodeImpl(1, new EmberNodeImpl('Ruby', undefined, undefined, true))],
			})
			await getRootDirReq.response

			// Run the tree
			const getByPathPromise = client.getElementByPath('Ruby.Sums.On')

			// First lookup
			expect(onSocketWrite).toHaveBeenCalledTimes(1)
			socket.mockData({
				value: [
					new NumberedTreeNodeImpl(
						1,
						new EmberNodeImpl('Ruby', undefined, undefined, true),
						childrenOf([new NumberedTreeNodeImpl(1, new EmberNodeImpl('Sums', undefined, undefined, true))])
					),
				],
			})

			await new Promise(setImmediate)

			// Second lookup
			expect(onSocketWrite).toHaveBeenCalledTimes(2)
			socket.mockData({
				value: [
					new QualifiedElementImpl<EmberElement>(
						'1.1',
						new EmberNodeImpl('Sums', undefined, undefined, false),
						childrenOf([
							new NumberedTreeNodeImpl(
								1,
								new ParameterImpl(ParameterType.Boolean, 'On', undefined, false)
							),
						])
					) as Exclude<RootElement, NumberedTreeNode<EmberElement>>,
				],
			})

			await new Promise(setImmediate)

			// lookup on the parameter
			expect(onSocketWrite).toHaveBeenCalledTimes(3)
			socket.mockData({
				value: [
					new QualifiedElementImpl<EmberElement>(
						'1.1.1',
						new ParameterImpl(ParameterType.Boolean, 'On', undefined, false)
					) as Exclude<RootElement, NumberedTreeNode<EmberElement>>,
				],
			})

			await new Promise(setImmediate)

			const res = await getByPathPromise
			expect(res).toBeTruthy()
			expect(res?.contents).toMatchObject(new ParameterImpl(ParameterType.Boolean, 'On', undefined, false))
		})
	})

	it('getElementByPath concurrent', async () => {
		await runWithConnection(async (client, socket) => {
			// Do initial load
			const getRootDirReq = await client.getDirectory(client.tree)
			getRootDirReq.response?.catch(() => null) // Ensure uncaught response is ok
			expect(onSocketWrite).toHaveBeenCalledTimes(1)
			onSocketWrite.mockClear()

			// Mock a valid response
			socket.mockData({
				value: [new NumberedTreeNodeImpl(1, new EmberNodeImpl('Ruby', undefined, undefined, true))],
			})
			await getRootDirReq.response

			// Run the tree
			const getByPathPromise = client.getElementByPath('Ruby.Sums.MAIN.On')
			const getByPathPromise2 = client.getElementByPath('Ruby.Sums.MAIN.Second')

			// First lookup from both
			expect(onSocketWrite).toHaveBeenCalledTimes(2)
			socket.mockData(
				createQualifiedNodeResponse(
					'1',
					new EmberNodeImpl('Ruby', undefined, undefined, true),
					childrenOf([new NumberedTreeNodeImpl(1, new EmberNodeImpl('Sums', undefined, undefined, false))])
				)
			)

			socket.mockData(
				createQualifiedNodeResponse(
					'1',
					new EmberNodeImpl('Ruby', undefined, undefined, true),
					childrenOf([new NumberedTreeNodeImpl(1, new EmberNodeImpl('Sums', undefined, undefined, false))])
				)
			)

			await new Promise(setImmediate)

			// Second lookup
			expect(onSocketWrite).toHaveBeenCalledTimes(4)
			socket.mockData(
				createQualifiedNodeResponse(
					'1.1',
					new EmberNodeImpl('Sums', undefined, undefined, false),
					childrenOf([new NumberedTreeNodeImpl(1, new EmberNodeImpl('MAIN', undefined, undefined, false))])
				)
			)
			await new Promise(setImmediate)
			socket.mockData(
				createQualifiedNodeResponse(
					'1.1',
					new EmberNodeImpl('Sums', undefined, undefined, false),
					childrenOf([new NumberedTreeNodeImpl(1, new EmberNodeImpl('MAIN', undefined, undefined, false))])
				)
			)

			await new Promise(setImmediate)

			// Final tree node
			expect(onSocketWrite).toHaveBeenCalledTimes(6)
			socket.mockData(
				createQualifiedNodeResponse(
					'1.1.1',
					new EmberNodeImpl('MAIN', undefined, undefined, false),
					childrenOf([
						new NumberedTreeNodeImpl(1, new ParameterImpl(ParameterType.Boolean, 'On', undefined, false)),
						new NumberedTreeNodeImpl(
							2,
							new ParameterImpl(ParameterType.Boolean, 'Second', undefined, false)
						),
					])
				)
			)

			await new Promise(setImmediate)

			// last call to the parameters just in case
			expect(onSocketWrite).toHaveBeenCalledTimes(8)
			socket.mockData(
				createQualifiedNodeResponse(
					'1.1.1.1',
					new ParameterImpl(ParameterType.Boolean, 'On', undefined, false),
					undefined
				)
			)
			socket.mockData(
				createQualifiedNodeResponse(
					'1.1.1.2',
					new ParameterImpl(ParameterType.Boolean, 'Second', undefined, false),
					undefined
				)
			)

			// Both completed successfully
			const res = await getByPathPromise
			expect(res).toBeTruthy()

			const res2 = await getByPathPromise2
			expect(res2).toBeTruthy()
		})
	})

	it('getElementByPath empty node in the root', async () => {
		await runWithConnection(async (client, socket) => {
			// Do initial load
			const getRootDirReq = await client.getDirectory(client.tree)
			getRootDirReq.response?.catch(() => null) // Ensure uncaught response is ok
			expect(onSocketWrite).toHaveBeenCalledTimes(1)
			onSocketWrite.mockClear()

			// Mock a valid response
			socket.mockData({
				value: [new NumberedTreeNodeImpl(1, new EmberNodeImpl('Ruby', undefined, undefined, true))],
			})
			await getRootDirReq.response

			// Request the empty node
			const req = await client.getDirectory(at([...client.tree.values()], 0))

			// Returns empty node
			expect(onSocketWrite).toHaveBeenCalledTimes(1)
			socket.mockData({
				value: [new NumberedTreeNodeImpl(1, new EmberNodeImpl())],
			})

			await new Promise(setImmediate)

			const res = await req.response
			expect(res).toBeTruthy()
		})
	})

	it('getElementByPath empty node in the tree', async () => {
		await runWithConnection(async (client, socket) => {
			// Do initial load
			const getRootDirReq = await client.getDirectory(client.tree)
			getRootDirReq.response?.catch(() => null) // Ensure uncaught response is ok
			expect(onSocketWrite).toHaveBeenCalledTimes(1)
			onSocketWrite.mockClear()

			// Mock a valid response
			socket.mockData({
				value: [new NumberedTreeNodeImpl(1, new EmberNodeImpl('Ruby', undefined, undefined, true))],
			})
			await getRootDirReq.response

			// Run the tree
			const getByPathPromise = client.getElementByPath('Ruby.Sums.Empty')

			// First lookup
			expect(onSocketWrite).toHaveBeenCalledTimes(1)
			socket.mockData({
				value: [
					new NumberedTreeNodeImpl(
						1,
						new EmberNodeImpl('Ruby', undefined, undefined, true),
						childrenOf([new NumberedTreeNodeImpl(1, new EmberNodeImpl('Sums', undefined, undefined, true))])
					),
				],
			})

			await new Promise(setImmediate)

			// Second lookup
			expect(onSocketWrite).toHaveBeenCalledTimes(2)
			socket.mockData({
				value: [
					new QualifiedElementImpl<EmberElement>(
						'1.1',
						new EmberNodeImpl('Sums', undefined, undefined, false),
						childrenOf([
							new NumberedTreeNodeImpl(1, new EmberNodeImpl('Empty', undefined, undefined, true)),
						])
					) as Exclude<RootElement, NumberedTreeNode<EmberElement>>,
				],
			})

			await new Promise(setImmediate)

			const getByPathRes = await getByPathPromise
			expect(getByPathRes).toBeTruthy()

			const node = client.tree.get(1)?.children?.get(1)?.children?.get(1)
			if (!node) throw new Error('Empty res') // really just a typeguard

			// Request the empty node
			const req = await client.getDirectory(node)

			// lookup on the empty node
			expect(onSocketWrite).toHaveBeenCalledTimes(3)
			socket.mockData({
				value: [
					new QualifiedElementImpl<EmberElement>('1.1.1', new EmberNodeImpl()) as Exclude<
						RootElement,
						NumberedTreeNode<EmberElement>
					>,
				],
			})

			await new Promise(setImmediate)

			const res = await req.response
			expect(res).toBeTruthy()
		})
	})

	describe('setValue', () => {
		// Reads a set request as sent: the path, which fields the contents set holds, the value and its BER tag,
		// and whether anything follows the contents (children)
		function readSetRequest(data: Buffer) {
			const reader = new Ber.Reader(data)
			reader.readSequence(Ber.APPLICATION(0)) // root
			reader.readSequence(Ber.APPLICATION(11)) // root element collection
			reader.readSequence(Ber.CONTEXT(0))
			reader.readSequence(Ber.APPLICATION(9)) // qualified parameter
			const parameterEnd = reader.offset + reader.length
			reader.readSequence(Ber.CONTEXT(0))
			const path = reader.readRelativeOID(Ber.BERDataTypes.RELATIVE_OID)
			reader.readSequence(Ber.CONTEXT(1))
			reader.readSequence(Ber.BERDataTypes.SET)
			const contentsEnd = reader.offset + reader.length

			const fields: number[] = []
			let valueTag: number | null = null
			let value: unknown
			while (reader.offset < contentsEnd) {
				const tag = reader.readSequence()
				if (tag === null) break
				fields.push(tag)
				if (tag === Ber.CONTEXT(2)) {
					valueTag = reader.peek()
					value = reader.readValue().value
				} else {
					const inner = reader.peek()
					if (inner !== null) reader.readStringAsBuffer(inner)
				}
			}
			return { path, fields, valueTag, value, hasChildren: contentsEnd < parameterEnd }
		}

		// A device, 1, with a parameter, 1.1, that has plenty of properties besides its value
		function seedParameter(client: EmberClient, parameter: Parameter) {
			const device = new NumberedTreeNodeImpl(
				1,
				new EmberNodeImpl('device'),
				childrenOf([new NumberedTreeNodeImpl(1, parameter)])
			)
			if (!device.children?.get(1)) throw new Error('Expected seeded parameter')
			childOf(device, 1).parent = device
			client.tree.set(1, device)
			return childOf(device, 1) as NumberedTreeNode<Parameter>
		}

		// As the specification's examples, Lawo's libember and Ember+ Viewer do: a QualifiedParameter holding the path
		// and only the value, without the type field
		test.each([
			[ParameterType.Integer, 20, Ber.BERDataTypes.INTEGER],
			[ParameterType.Real, 2, Ber.BERDataTypes.REAL],
			[ParameterType.Enum, 3, Ber.BERDataTypes.INTEGER],
			[ParameterType.Boolean, true, Ber.BERDataTypes.BOOLEAN],
			[ParameterType.String, 'name', Ber.BERDataTypes.STRING],
		])('sends only the path and value of a %s parameter', async (parameterType, value, valueTag) => {
			await runWithConnection(async (client) => {
				const node = seedParameter(
					client,
					// The table pairs each type with a value of its form
					<Parameter>(
						new ParameterImpl(
							parameterType,
							'param',
							'Param',
							undefined,
							parameterType === ParameterType.String || parameterType === ParameterType.Boolean
								? undefined
								: 70,
							parameterType === ParameterType.String || parameterType === ParameterType.Boolean
								? undefined
								: -20,
							ParameterAccess.ReadWrite,
							'%d',
							parameterType === ParameterType.Enum ? 'a\nb\nc\nd' : undefined
						)
					)
				)

				await client.setValue(node, value, false)

				expect(onSocketWrite).toHaveBeenCalledTimes(1)
				const request = readSetRequest(at(onSocketWrite.mock.calls, 0)[0])
				expect(request.path).toBe('1.1')
				expect(request.fields).toEqual([Ber.CONTEXT(2)])
				expect(request.valueTag).toBe(valueTag)
				expect(request.value).toEqual(value)
				expect(request.hasChildren).toBe(false)

				// the cached parameter is unchanged until the provider replies
				expect(node.contents.value).toBeUndefined()
				expect(node.contents.identifier).toBe('param')
			})
		})

		// A value of the parameter type's form: a caller that doesn't check types is refused before anything is sent (such
		// a value was sent, coerced by the encoder or not)
		it.each<[ParameterType, unknown]>([
			[ParameterType.Integer, '20'],
			[ParameterType.Boolean, 1],
			[ParameterType.String, 5],
		])("refuses a value that doesn't fit a %s parameter, and sends nothing", async (parameterType, value) => {
			await runWithConnection(async (client) => {
				const node = seedParameter(client, <Parameter>new ParameterImpl(parameterType, 'param'))

				await expect(client.setValue(node, value as EmberValue)).rejects.toThrow(
					`doesn't fit a parameter of the type ${parameterType}`
				)
				expect(onSocketWrite).not.toHaveBeenCalled()
			})
		})

		it("takes only a value of a narrowed parameter's form", () => {
			// Not called: it only has to compile, or not
			const typed = (client: EmberClient, gain: NumberedTreeNode<TypedParameter<ParameterType.Integer>>) => {
				void client.setValue(gain, 20)
				void client.setValue(gain, null)
				// @ts-expect-error an integer parameter's value is a number
				void client.setValue(gain, '20')
			}
			expect(typeof typed).toBe('function')
		})

		it('updates the tree when the provider replies', async () => {
			await runWithConnection(async (client, socket) => {
				const node = seedParameter(
					client,
					new ParameterImpl(ParameterType.Integer, 'gain', undefined, 0, 70, -20)
				)

				const request = await client.setValue(node, 20)
				socket.mockData(
					createQualifiedNodeResponse(
						'1.1',
						new ParameterImpl(ParameterType.Integer, undefined, undefined, 20),
						undefined
					)
				)

				await expect(request.response).resolves.toBe(node)
				expect(node.contents.value).toBe(20)
				expect(node.contents.identifier).toBe('gain')
				expect(node.contents.maximum).toBe(70)
			})
		})

		// A request is answered by what the provider reports at its path. Whatever that was, the response resolved
		// with it, typed as the parameter.
		it("rejects a reply that isn't a parameter", async () => {
			await runWithConnection(async (client, socket) => {
				const gain = new QualifiedElementImpl(
					'1.1',
					new ParameterImpl(ParameterType.Integer, 'gain', undefined, 0)
				)

				const request = await client.setValue(gain, 20) // not loaded: the reply is reported as it comes
				socket.mockData(createQualifiedNodeResponse('1.1', new EmberNodeImpl('gain'), undefined))

				await expect(request.response).rejects.toThrow('Unexpected reply to the request to 1.1: a node at 1.1')
			})
		})
	})

	describe('matrix connections', () => {
		// Reads a connect request as sent: the path, which fields follow it and the connections
		function readConnectRequest(data: Buffer) {
			const reader = new Ber.Reader(data)
			reader.readSequence(Ber.APPLICATION(0)) // root
			reader.readSequence(Ber.APPLICATION(11)) // root element collection
			reader.readSequence(Ber.CONTEXT(0))
			reader.readSequence(Ber.APPLICATION(17)) // qualified matrix
			const matrixEnd = reader.offset + reader.length
			reader.readSequence(Ber.CONTEXT(0))
			const path = reader.readRelativeOID(Ber.BERDataTypes.RELATIVE_OID)

			const fields: number[] = []
			while (reader.offset < matrixEnd) {
				const tag = reader.readSequence()
				if (tag === null) break
				fields.push(tag)
				const inner = reader.peek()
				if (inner !== null) reader.readStringAsBuffer(inner)
			}
			const matrix = (berDecode(data).value as Array<RootElement>)[0] as QualifiedElement<Matrix>
			return { path, fields, connections: matrix.contents.connections }
		}

		// A device, 1, with a matrix, 1.1, as a provider reports it in reply to a GetDirectory on the matrix: its
		// contents, targets, sources and the connections of every target
		function seedMatrix(client: EmberClient) {
			const device = new NumberedTreeNodeImpl(
				1,
				new EmberNodeImpl('device'),
				childrenOf([
					new NumberedTreeNodeImpl(
						1,
						new MatrixImpl(
							'matrix',
							signalsOf([1, 2, 3]),
							signalsOf([1, 2, 3, 4]),
							connectionsOf([
								{ target: 1, sources: [1] },
								{ target: 2, sources: [2] },
								{ target: 3, sources: [] },
							]),
							'Matrix',
							MatrixType.OneToN,
							MatrixAddressingMode.NonLinear,
							3,
							4,
							undefined,
							undefined,
							undefined,
							undefined,
							[{ basePath: '1.2', description: 'labels' }]
						)
					),
				])
			)
			if (!device.children?.get(1)) throw new Error('Expected seeded matrix')
			childOf(device, 1).parent = device
			client.tree.set(1, device)
			return childOf(device, 1) as NumberedTreeNode<Matrix>
		}

		// A provider ignores a request naming a target or source its matrix doesn't have (the XACI does), so the
		// request only timed out. The client refuses it, when the matrix it has lists them.
		describe('a target or source the matrix does not have', () => {
			it('refuses a target, sending nothing', async () => {
				await runWithConnection(async (client) => {
					const node = seedMatrix(client)

					await expect(client.matrixConnect(node, 9, [1])).rejects.toThrow(
						'Matrix 1.1: target 9 is not one of its targets'
					)
					expect(onSocketWrite).not.toHaveBeenCalled()
				})
			})

			it('refuses sources, sending nothing', async () => {
				await runWithConnection(async (client) => {
					const node = seedMatrix(client)

					await expect(client.matrixSetConnection(node, 1, [2, 8, 9])).rejects.toThrow(
						'Matrix 1.1: sources 8, 9 not among its sources'
					)
					await expect(client.matrixDisconnect(node, 1, [8])).rejects.toThrow(
						'Matrix 1.1: source 8 not among its sources'
					)
					expect(onSocketWrite).not.toHaveBeenCalled()
				})
			})

			it("goes by the tree's copy of the matrix, given one built from its path", async () => {
				await runWithConnection(async (client) => {
					seedMatrix(client)
					const byPath = new QualifiedElementImpl<Matrix>('1.1', { type: ElementType.Matrix })

					await expect(client.matrixConnect(byPath, 9, [1])).rejects.toThrow(
						'target 9 is not one of its targets'
					)
				})
			})

			it('lets a request through when the matrix gives no targets or sources to tell by', async () => {
				await runWithConnection(async (client) => {
					const unknown = new QualifiedElementImpl<Matrix>('2.1', { type: ElementType.Matrix })

					const request = await client.matrixConnect(unknown, 9, [9])
					request.response?.catch(() => null) // no reply here

					expect(onSocketWrite).toHaveBeenCalledTimes(1)
				})
			})
		})

		// A report's targets (sources) are the matrix's whole collection, contents and all: the Glow DTD has a non-linear
		// matrix's targetCount "define the number of targets contained in the targets property". They replace those kept;
		// a report without them, such as one of connections, leaves them. (A signal's contents were merged signal by
		// signal, the numbers replaced, so contents were kept for targets no longer listed.)
		it("replaces the matrix's targets and sources with those a report gives", async () => {
			await runWithConnection(async (client, socket) => {
				const node = seedMatrix(client)
				node.contents.targets = new Map([
					[1, { identifier: 'out-1', labelsLocation: '1.9.1' }],
					[2, {}],
				])

				const report = (contents: Matrix) =>
					socket.mockData(createQualifiedNodeResponse('1.1', contents, undefined))
				report({
					type: ElementType.Matrix,
					targets: new Map([
						[2, { identifier: 'out-2' }],
						[3, {}],
					]),
					sources: new Map([[4, { labelsLocation: '1.8.4' }]]),
				})
				await new Promise(setImmediate)
				report({ type: ElementType.Matrix, connections: connectionsOf([{ target: 3, sources: [4] }]) }) // no signals
				await new Promise(setImmediate)

				expect(node.contents.targets).toEqual(
					new Map([
						[2, { identifier: 'out-2' }],
						[3, {}],
					])
				)
				expect(node.contents.sources).toEqual(new Map([[4, { labelsLocation: '1.8.4' }]]))
			})
		})

		// As the specification's examples, Lawo's libember and Ember+ Viewer do: a QualifiedMatrix holding the path
		// and only the connection, without contents
		test.each([
			['matrixConnect', ConnectionOperation.Connect],
			['matrixDisconnect', ConnectionOperation.Disconnect],
			['matrixSetConnection', ConnectionOperation.Absolute],
		] as const)('%s sends only the path and the connection', async (method, operation) => {
			await runWithConnection(async (client) => {
				const node = seedMatrix(client)
				const stored = node.contents.connections

				const request = await client[method](node, 2, [3])
				request.response?.catch(() => null) // no reply here, so the request is cancelled on disconnect

				expect(onSocketWrite).toHaveBeenCalledTimes(1)
				const sent = readConnectRequest(at(onSocketWrite.mock.calls, 0)[0])
				expect(sent.path).toBe('1.1')
				expect(sent.fields).toEqual([Ber.CONTEXT(5)])
				expect(sent.connections).toEqual(connectionsOf([{ target: 2, sources: [3], operation }]))

				// the cached matrix is unchanged until the provider replies
				expect(node.contents.connections).toBe(stored)
				expect(node.contents.connections).toEqual(
					connectionsOf([
						{ target: 1, sources: [1] },
						{ target: 2, sources: [2] },
						{ target: 3, sources: [] },
					])
				)
			})
		})

		it('updates the tree when the provider replies', async () => {
			await runWithConnection(async (client, socket) => {
				const node = seedMatrix(client)

				const request = await client.matrixConnect(node, 2, [3])
				// a report without contents, decoded: the path and the changed target
				socket.mockData(
					createQualifiedNodeResponse(
						'1.1',
						new MatrixImpl(undefined, undefined, undefined, connectionsOf([{ target: 2, sources: [3] }])),
						undefined
					)
				)

				await expect(request.response).resolves.toBeDefined()
				expect(node.contents.connections?.get(2)).toEqual({ target: 2, sources: [3] })
				expect(node.contents.identifier).toBe('matrix')
				expect(node.contents.targets).toEqual(signalsOf([1, 2, 3]))
			})
		})

		// A provider's report on the matrix 1.1, without contents: the connection of one target
		const report = (target: number, sources: number[], disposition?: ConnectionDisposition) =>
			createQualifiedNodeResponse(
				'1.1',
				new MatrixImpl(undefined, undefined, undefined, connectionsOf([{ target, sources, disposition }])),
				undefined
			)

		// Follows a request's response: 'pending' until it settles
		function track(response: Promise<unknown> | undefined) {
			const state: { settled: 'pending' | 'resolved' | Error } = { settled: 'pending' }
			response?.then(
				() => (state.settled = 'resolved'),
				(e) => (state.settled = e)
			)
			return state
		}

		// The matrix's other targets may change, and be reported, while the request is under way
		it('waits for the report on the requested target', async () => {
			await runWithConnection(async (client, socket) => {
				const node = seedMatrix(client)

				const response = track((await client.matrixConnect(node, 2, [3])).response)
				socket.mockData(report(1, [4], ConnectionDisposition.Modified))
				await new Promise(setImmediate)
				expect(response.settled).toBe('pending')
				expect(node.contents.connections?.get(1)?.sources).toEqual([4])

				socket.mockData(report(2, [3], ConnectionDisposition.Modified))
				await new Promise(setImmediate)
				expect(response.settled).toBe('resolved')
			})
		})

		// Locked: "the connect operation could not be executed because the target is locked. The sources property
		// [...] must contain the absolute set of sources currently connected."
		it('rejects when the provider reports the target as locked', async () => {
			await runWithConnection(async (client, socket) => {
				const node = seedMatrix(client)

				const request = await client.matrixConnect(node, 2, [3])
				socket.mockData(report(2, [2], ConnectionDisposition.Locked))

				await expect(request.response).rejects.toThrow('Matrix 1.1: target 2 is locked')
				expect(node.contents.connections?.get(2)?.sources).toEqual([2])
			})
		})

		// Pending: "the connect operation was queued, but is not yet current". The provider has taken the request;
		// the tree changes when it reports the connection as made.
		it('resolves when the provider reports the connection as pending', async () => {
			await runWithConnection(async (client, socket) => {
				const node = seedMatrix(client)

				const request = await client.matrixConnect(node, 2, [3])
				socket.mockData(report(2, [3], ConnectionDisposition.Pending))

				await expect(request.response).resolves.toBe(node)
				expect(node.contents.connections?.get(2)?.sources).toEqual([2])
			})
		})

		it('resolves on a report of the matrix inside its parent', async () => {
			await runWithConnection(async (client, socket) => {
				const node = seedMatrix(client)

				const response = track((await client.matrixConnect(node, 2, [3])).response)
				const inParent = (target: number) =>
					createQualifiedNodeResponse(
						'1',
						new EmberNodeImpl(),
						childrenOf([
							new NumberedTreeNodeImpl(
								1,
								new MatrixImpl(
									undefined,
									undefined,
									undefined,
									connectionsOf([{ target, sources: [3] }])
								)
							),
						])
					)
				socket.mockData(inParent(1))
				await new Promise(setImmediate)
				expect(response.settled).toBe('pending')

				socket.mockData(inParent(2))
				await new Promise(setImmediate)
				expect(response.settled).toBe('resolved')
			})
		})

		// A consumer may address a matrix by its path without loading the tree down to it
		it('settles for a matrix that is not in the loaded tree', async () => {
			await runWithConnection(async (client, socket) => {
				const matrix = new QualifiedElementImpl('1.1', new MatrixImpl('matrix'))

				const response = track((await client.matrixConnect(matrix, 2, [3])).response)
				socket.mockData(report(1, [4]))
				await new Promise(setImmediate)
				expect(response.settled).toBe('pending')

				socket.mockData(report(2, [2], ConnectionDisposition.Locked))
				await new Promise(setImmediate)
				expect(response.settled).toEqual(new Error('Matrix 1.1: target 2 is locked'))
			})
		})
	})

	describe('getElementByPath on a parameter', () => {
		// A device, 1, with a parameter, 1.1, already in the tree from an earlier GetDirectory on the device
		function seedParameter(client: EmberClient) {
			const device = new NumberedTreeNodeImpl(
				1,
				new EmberNodeImpl('device'),
				childrenOf([
					new NumberedTreeNodeImpl(1, new ParameterImpl(ParameterType.Integer, 'gain', undefined, 0)),
				])
			)
			if (!device.children?.get(1)) throw new Error('Expected seeded parameter')
			childOf(device, 1).parent = device
			client.tree.set(1, device)
			return childOf(device, 1) as NumberedTreeNode<Parameter>
		}

		// Some providers never answer a GetDirectory on a parameter
		it('sends a GetDirectory to the parameter without waiting for a reply', async () => {
			await runWithConnection(async (client) => {
				const node = seedParameter(client)

				let found: TreeElement<EmberElement> | undefined
				client
					.getElementByPath('1.1')
					.then((element) => (found = element))
					.catch(() => null) // without a reply, a lookup that waits is cancelled on disconnect
				await new Promise(setImmediate)

				expect(found).toBe(node)
				expect(onSocketWrite).toHaveBeenCalledTimes(1)
				const request = firstElement(at(onSocketWrite.mock.calls, 0)[0])
				expect(request).toMatchObject({ path: '1.1', contents: { type: ElementType.Parameter } })
				expect([...(request.children?.values() ?? [])]).toMatchObject([
					{ contents: { type: ElementType.Command, number: CommandType.GetDirectory } },
				])
			})
		})

		// Others may only report a parameter's changes once it has had a GetDirectory
		it('applies the reply and calls the callback when the provider answers', async () => {
			await runWithConnection(async (client, socket) => {
				const node = seedParameter(client)
				const cb = vi.fn()

				await client.getElementByPath('1.1', cb)
				socket.mockData(
					createQualifiedNodeResponse(
						'1.1',
						new ParameterImpl(ParameterType.Integer, undefined, undefined, 5),
						undefined
					)
				)
				await new Promise(setImmediate)

				expect(node.contents.value).toBe(5)
				expect(cb).toHaveBeenCalledWith(node)
			})
		})

		// The option this fork adds turns the GetDirectory off altogether
		it('sends no GetDirectory to the parameter when getDirectoryOnParams is off', async () => {
			await runWithConnection(
				async (client) => {
					const node = seedParameter(client)

					await expect(client.getElementByPath('1.1')).resolves.toBe(node)
					expect(onSocketWrite).not.toHaveBeenCalled()
				},
				{ getDirectoryOnParams: false }
			)
		})
	})

	describe('getElementByPath path forms', () => {
		// A device, 1 "device", with loaded parameters, as [number, identifier, description]
		function seedDevice(client: EmberClient, parameters: Array<[number, string, string]>) {
			const children: Children = new Map()
			const device = new NumberedTreeNodeImpl(1, new EmberNodeImpl('device', 'Device'), children)
			for (const [number, identifier, description] of parameters) {
				const parameter = new NumberedTreeNodeImpl(
					number,
					new ParameterImpl(ParameterType.Integer, identifier, description, 0)
				)
				parameter.parent = device
				children.set(number, parameter)
			}
			client.tree.set(1, device)
			return children
		}

		// Devices often label strips or channels with their own numbering, offset from the elements' numbers
		test.each<[string, Array<[number, string, string]>]>([
			[
				'description',
				[
					[1, 'strip-a', '2'],
					[2, 'strip-b', '3'],
				],
			],
			[
				'identifier',
				[
					[1, '2', 'Strip A'],
					[2, '3', 'Strip B'],
				],
			],
		])(
			'resolves a numbered path by number, not by an earlier sibling with that number as its %s',
			async (_, parameters) => {
				await runWithConnection(async (client) => {
					const elements = seedDevice(client, parameters)

					await expect(client.getElementByPath('1.2')).resolves.toBe(elements.get(2))
				})
			}
		)

		it('prefers an identifier to an earlier description in a textual path', async () => {
			await runWithConnection(async (client) => {
				const elements = seedDevice(client, [
					[1, 'trim', 'level'],
					[2, 'level', 'Level'],
				])

				await expect(client.getElementByPath('device.level')).resolves.toBe(elements.get(2))
			})
		})

		it('resolves descriptions, and numbers in a path that mixes them with text', async () => {
			await runWithConnection(async (client) => {
				const elements = seedDevice(client, [
					[1, 'trim', 'Trim'],
					[2, 'gain', 'Gain'],
				])

				await expect(client.getElementByPath('Device.Gain')).resolves.toBe(elements.get(2))
				await expect(client.getElementByPath('device.2')).resolves.toBe(elements.get(2))
			})
		})
	})

	describe('command requests', () => {
		// Reads a command request as sent: the element's BER type, its path, which fields follow the path and the
		// commands
		function readCommandRequest(data: Buffer) {
			const reader = new Ber.Reader(data)
			reader.readSequence(Ber.APPLICATION(0)) // root
			reader.readSequence(Ber.APPLICATION(11)) // root element collection
			reader.readSequence(Ber.CONTEXT(0))
			const elementTag = reader.readSequence()
			const elementEnd = reader.offset + reader.length
			reader.readSequence(Ber.CONTEXT(0))
			const path = reader.readRelativeOID(Ber.BERDataTypes.RELATIVE_OID)

			const fields: number[] = []
			while (reader.offset < elementEnd) {
				const tag = reader.readSequence()
				if (tag === null) break
				fields.push(tag)
				const inner = reader.peek()
				if (inner !== null) reader.readStringAsBuffer(inner)
			}
			const element = firstElement(data)
			const commands = [...(element.children?.values() ?? [])].map((child) => child.contents)
			return { elementTag, path, fields, commands }
		}

		// A device, 1, with a node, a parameter, a matrix and a function that have plenty of properties, as discovered
		function seedDevice(client: EmberClient) {
			const device = new NumberedTreeNodeImpl(
				1,
				new EmberNodeImpl('device'),
				childrenOf([
					new NumberedTreeNodeImpl(1, new EmberNodeImpl('node', 'Node', false, true)),
					new NumberedTreeNodeImpl(
						2,
						new ParameterImpl(ParameterType.Integer, 'gain', 'Gain', 0, 70, -20, ParameterAccess.ReadWrite)
					),
					new NumberedTreeNodeImpl(
						3,
						new MatrixImpl(
							'matrix',
							undefined,
							undefined,
							undefined,
							'Matrix',
							MatrixType.OneToN,
							undefined,
							4,
							4
						)
					),
					new NumberedTreeNodeImpl(
						4,
						new EmberFunctionImpl(
							'add',
							'Add',
							[
								new FunctionArgumentImpl(ParameterType.Integer, 'a'),
								new FunctionArgumentImpl(ParameterType.Integer, 'b'),
							],
							[new FunctionArgumentImpl(ParameterType.Integer, 'sum')]
						)
					),
				])
			)
			const elements = device.children ?? new Map<number, NumberedTreeNode<EmberElement>>()
			for (const element of elements.values()) element.parent = device
			client.tree.set(1, device)
			return elements
		}

		type Send = (client: EmberClient, element: NumberedTreeNode<any>) => Promise<{ response?: Promise<unknown> }>
		const getDirectory: Send = async (c, e) => c.getDirectory(e)
		const args: EmberTypedValue[] = [
			{ type: ParameterType.Integer, value: 1 },
			{ type: ParameterType.Integer, value: 2 },
		]

		// As the specification's examples send them: the path and the command, without the element's contents
		test.each<[string, number, number, Send, object]>([
			['GetDirectory on a node', 1, Ber.APPLICATION(10), getDirectory, { number: CommandType.GetDirectory }],
			['GetDirectory on a parameter', 2, Ber.APPLICATION(9), getDirectory, { number: CommandType.GetDirectory }],
			['GetDirectory on a matrix', 3, Ber.APPLICATION(17), getDirectory, { number: CommandType.GetDirectory }],
			['Subscribe', 2, Ber.APPLICATION(9), async (c, e) => c.subscribe(e), { number: CommandType.Subscribe }],
			[
				'Unsubscribe',
				2,
				Ber.APPLICATION(9),
				async (c, e) => c.unsubscribe(e),
				{ number: CommandType.Unsubscribe },
			],
			[
				'Invoke',
				4,
				Ber.APPLICATION(20),
				async (c, e) => c.invoke(e, ...args),
				{ number: CommandType.Invoke, invocation: { args } },
			],
		])('%s sends only the path and the command', async (_, number, elementTag, send, command) => {
			await runWithConnection(async (client) => {
				seedDevice(client)

				const request = await send(client, childOf(device(client), number))
				request.response?.catch(() => null) // no reply here, so the request is cancelled on disconnect

				expect(onSocketWrite).toHaveBeenCalledTimes(1)
				const sent = readCommandRequest(at(onSocketWrite.mock.calls, 0)[0])
				expect(sent.elementTag).toBe(elementTag)
				expect(sent.path).toBe(`1.${number}`)
				expect(sent.fields).toEqual([Ber.CONTEXT(2)])
				expect(sent.commands).toMatchObject([{ type: ElementType.Command, ...command }])
			})
		})
	})

	describe('invoke', () => {
		// An Invoke is answered by the result of its invocation. Requests were matched to changes by path alone, so a
		// report on the function while it ran resolved the Invoke with the function, as the result.
		it('resolves with the invocation result, not with a report on the function', async () => {
			await runWithConnection(async (client, socket) => {
				const fn = new NumberedTreeNodeImpl(1, new EmberFunctionImpl('add', 'Add'))
				client.tree.set(1, fn)
				const request = await client.invoke(fn, { type: ParameterType.Integer, value: 1 })
				let response: unknown = 'pending'
				request.response?.then((r) => (response = r)).catch(() => null)

				socket.mockData(
					createQualifiedNodeResponse('1', new EmberFunctionImpl('add', 'Add, changed'), undefined)
				)
				await new Promise(setImmediate)
				expect(response).toBe('pending')

				const result = new InvocationResultImpl(1, true, [{ type: ParameterType.Integer, value: 2 }])
				socket.mockData({ value: result, errors: [] })
				await new Promise(setImmediate)
				expect(response).toBe(result)
			})
		})
	})

	describe('Subscription behavior regressions', () => {
		it('invokes all callbacks subscribed to the same path', async () => {
			await runWithConnection(async (client, socket) => {
				const cb1 = vi.fn()
				const cb2 = vi.fn()

				const parameter = new ParameterImpl(ParameterType.Integer, 'Level', undefined, 1)
				const node = new NumberedTreeNodeImpl(1, parameter)

				await client.subscribe(node, cb1)
				await client.subscribe(node, cb2)

				// Prime the tree first so subsequent qualified updates match path "1".
				socket.mockData({
					value: [
						new NumberedTreeNodeImpl(1, new ParameterImpl(ParameterType.Integer, 'Level', undefined, 1)),
					],
				})
				await new Promise(setImmediate)

				socket.mockData(
					createQualifiedNodeResponse(
						'1',
						new ParameterImpl(ParameterType.Integer, 'Level', undefined, 2),
						undefined
					)
				)

				await new Promise(setImmediate)

				expect(cb1).toHaveBeenCalledTimes(1)
				expect(cb2).toHaveBeenCalledTimes(1)
			})
		})

		it('removes all matching subscriptions when unsubscribing a path', async () => {
			await runWithConnection(async (client) => {
				const parameter = new ParameterImpl(ParameterType.Integer, 'Level', undefined, 1)
				const node = new NumberedTreeNodeImpl(1, parameter)

				await client.subscribe(node, vi.fn())
				await client.subscribe(node, vi.fn())

				//@ts-expect-error - private member
				expect(client._subscriptions.get('1')).toHaveLength(2)

				await client.unsubscribe(node)

				//@ts-expect-error - private member
				expect(client._subscriptions.has('1')).toBe(false)
			})
		})

		it('handles qualified updates that introduce new child nodes', async () => {
			await runWithConnection(async (client, socket) => {
				socket.mockData({
					value: [
						new NumberedTreeNodeImpl(
							1,
							new EmberNodeImpl('Root', undefined, undefined, true),
							childrenOf([
								new NumberedTreeNodeImpl(1, new EmberNodeImpl('Existing', undefined, undefined, true)),
							])
						),
					],
				})
				await new Promise(setImmediate)

				const update = createQualifiedNodeResponse(
					'1',
					new EmberNodeImpl('Root', undefined, undefined, true),
					childrenOf([
						new NumberedTreeNodeImpl(1, new EmberNodeImpl('Existing', undefined, undefined, true)),
						new NumberedTreeNodeImpl(2, new EmberNodeImpl('Inserted', undefined, undefined, true)),
					])
				)

				expect(() => socket.mockData(update)).not.toThrow()
				await new Promise(setImmediate)

				expect(client.tree.get(1)?.children?.get(2)).toBeDefined()
			})
		})

		it('queues one parent-path change when several missing children are inserted', async () => {
			await runWithConnection(async (client) => {
				const root = new NumberedTreeNodeImpl(
					1,
					new EmberNodeImpl('Root', undefined, undefined, true),
					childrenOf([new NumberedTreeNodeImpl(1, new EmberNodeImpl('Existing', undefined, undefined, true))])
				)
				if (!root.children?.get(1)) throw new Error('Expected seeded child')
				childOf(root, 1).parent = root
				client.tree.set(1, root)

				const update = createQualifiedNodeResponse(
					'1',
					new EmberNodeImpl('Root', undefined, undefined, true),
					childrenOf([
						new NumberedTreeNodeImpl(1, new EmberNodeImpl('Existing', undefined, undefined, true)),
						new NumberedTreeNodeImpl(2, new EmberNodeImpl('Inserted A', undefined, undefined, true)),
						new NumberedTreeNodeImpl(3, new EmberNodeImpl('Inserted B', undefined, undefined, true)),
					])
				)

				//@ts-expect-error - private method under regression test
				const changes = client._applyRootToTree({ ...update, rootType: RootType.Elements })

				expect(changes.filter((change) => change.path === '1')).toHaveLength(1)
				expect(client.tree.get(1)?.children?.get(2)?.parent).toBe(client.tree.get(1))
				expect(client.tree.get(1)?.children?.get(3)?.parent).toBe(client.tree.get(1))
			})
		})
	})

	describe('Matrix connection updates', () => {
		// Providers report a crosspoint change with only the targets that changed
		it('keeps the other targets when a report covers one target', async () => {
			await runWithConnection(async (client, socket) => {
				socket.mockData({
					value: [
						new NumberedTreeNodeImpl(
							1,
							new EmberNodeImpl('router'),
							childrenOf([
								new NumberedTreeNodeImpl(
									1,
									new MatrixImpl(
										'matrix',
										undefined,
										undefined,
										connectionsOf([
											{ target: 0, sources: [1] },
											{ target: 1, sources: [2] },
											{ target: 2, sources: [0] },
											{ target: 3, sources: [3] },
										])
									)
								),
							])
						),
					],
				})
				await new Promise(setImmediate)

				socket.mockData(
					createQualifiedNodeResponse(
						'1.1',
						new MatrixImpl('matrix', undefined, undefined, connectionsOf([{ target: 1, sources: [3] }])),
						undefined
					)
				)
				await new Promise(setImmediate)

				const matrix = client.tree.get(1)?.children?.get(1)?.contents as Matrix
				expect(matrix.connections).toEqual(
					connectionsOf([
						{ target: 0, sources: [1] },
						{ target: 1, sources: [3] },
						{ target: 2, sources: [0] },
						{ target: 3, sources: [3] },
					])
				)
			})
		})

		// Captured from a test device. It answers a GetDirectory on matrix 0.5.2 with one message per
		// target, and reports each change the same way.
		it("merges a test device's one-target reports", async () => {
			const reports = [
				'60806b80a0807180a0050d03000502a5803080a0807080a00302010aa1040d02812ca30302010100000000000000000000000000000000', // target 10 <- 172
				'60806b80a0807180a0050d03000502a5803080a0807080a00302010ba1040d02812ba30302010100000000000000000000000000000000', // target 11 <- 171
				'60806b80a0807180a0050d03000502a5803080a0807080a00302010ca1040d02812ca30302010100000000000000000000000000000000', // target 12 <- 172
				'60806b80a0807180a0050d03000502a5803080a0807080a00302010da1040d02812ca30302010100000000000000000000000000000000', // target 13 <- 172
				'60806b80a0807180a0050d03000502a5803080a0807080a00302010aa1040d02812da30302010100000000000000000000000000000000', // change: target 10 <- 173
				'60806b80a0807180a0050d03000502a5803080a0807080a00302010da1020d00a30302010100000000000000000000000000000000', // disconnect: target 13 <- none
			]

			await runWithConnection(async (client, socket) => {
				socket.mockData({
					value: [
						new NumberedTreeNodeImpl(
							0,
							new EmberNodeImpl('device'),
							childrenOf([
								new NumberedTreeNodeImpl(
									5,
									new EmberNodeImpl('routing'),
									childrenOf([
										new NumberedTreeNodeImpl(
											2,
											new MatrixImpl(
												'matrix',
												signalsOf([10, 11, 12, 13]),
												signalsOf([170, 171, 172, 173]),
												undefined,
												undefined,
												undefined,
												MatrixAddressingMode.NonLinear,
												4,
												4
											)
										),
									])
								),
							])
						),
					],
				})
				await new Promise(setImmediate)

				for (const report of reports) {
					socket.mockData(berDecode(Buffer.from(report, 'hex')))
					await new Promise(setImmediate)
				}

				const matrix = client.tree.get(0)?.children?.get(5)?.children?.get(2)?.contents as Matrix
				expect([...(matrix.connections?.values() ?? [])].map((c) => [c.target, c.sources])).toEqual([
					[10, [173]],
					[11, [171]],
					[12, [172]],
					[13, []],
				])
			})
		})

		// Connections are kept by their target. Going through all of them for each reported connection made a full
		// report on a matrix that already had its connections take targets x targets steps: seconds, for a big one.
		it("finds a reported target's connection without going through all of them", async () => {
			await runWithConnection(async (client, socket) => {
				// Counts the connections looked at: one for a lookup, all of them for a pass through them
				class CountedConnections extends Map<number, Connection> {
					reads = 0
					override get(target: number) {
						this.reads++
						return super.get(target)
					}
					override values() {
						this.reads += this.size
						return super.values()
					}
					override entries() {
						this.reads += this.size
						return super.entries()
					}
					override [Symbol.iterator]() {
						this.reads += this.size
						return super[Symbol.iterator]()
					}
				}
				const counted = new CountedConnections()
				for (let target = 0; target < 2000; target++) counted.set(target, { target, sources: [0] })
				const router = new NumberedTreeNodeImpl(
					1,
					new EmberNodeImpl('router'),
					childrenOf([new NumberedTreeNodeImpl(1, new MatrixImpl('matrix', undefined, undefined, counted))])
				)
				if (!router.children?.get(1)) throw new Error('Expected seeded matrix')
				childOf(router, 1).parent = router
				client.tree.set(1, router)

				socket.mockData(
					createQualifiedNodeResponse(
						'1.1',
						new MatrixImpl(
							undefined,
							undefined,
							undefined,
							connectionsOf([{ target: 1500, sources: [7] }])
						),
						undefined
					)
				)
				await new Promise(setImmediate)

				expect(counted.get(1500)?.sources).toEqual([7])
				expect(counted.reads).toBeLessThan(10)
			})
		})

		// What a report's sources are depends on its disposition. Tally: "the absolute set of sources currently
		// connected". Modified: "sources contains new current state". Pending: "sources contains future state".
		// Locked: "sources contains current state".
		describe('dispositions', () => {
			// A router, 1, with a matrix, 1.1, whose connections are loaded or not
			function seedMatrix(client: EmberClient, connections?: Connections) {
				const router = new NumberedTreeNodeImpl(
					1,
					new EmberNodeImpl('router'),
					childrenOf([
						new NumberedTreeNodeImpl(1, new MatrixImpl('matrix', undefined, undefined, connections)),
					])
				)
				if (!router.children?.get(1)) throw new Error('Expected seeded matrix')
				childOf(router, 1).parent = router
				client.tree.set(1, router)
				return childOf(router, 1).contents as Matrix
			}
			// A provider's report on the matrix: the connections of some targets
			const report = (...connections: Connection[]) =>
				createQualifiedNodeResponse(
					'1.1',
					new MatrixImpl('', undefined, undefined, connectionsOf(connections)),
					undefined
				)
			const { Tally, Modified, Pending, Locked } = ConnectionDisposition

			it('keeps the sources of a connection while a change to it is pending, and marks it', async () => {
				await runWithConnection(async (client, socket) => {
					const matrix = seedMatrix(client, connectionsOf([{ target: 2, sources: [2] }]))

					socket.mockData(report({ target: 2, sources: [3], disposition: Pending }))
					expect(matrix.connections?.get(2)).toEqual({ target: 2, sources: [2], disposition: Pending })

					socket.mockData(report({ target: 2, sources: [3], disposition: Modified }))
					expect(matrix.connections?.get(2)).toEqual({ target: 2, sources: [3], disposition: Modified })
				})
			})

			it('takes the current sources from a report that the target is locked', async () => {
				await runWithConnection(async (client, socket) => {
					const matrix = seedMatrix(client, connectionsOf([{ target: 2, sources: [2] }]))

					// the target's connection had changed without this consumer hearing of it
					socket.mockData(report({ target: 2, sources: [4], disposition: Locked }))
					expect(matrix.connections?.get(2)).toEqual({ target: 2, sources: [4], disposition: Locked })

					// a later report without a disposition is a tally
					socket.mockData(report({ target: 2, sources: [4] }))
					expect(matrix.connections?.get(2)?.disposition).toBeUndefined()
				})
			})

			it('does not take a pending connection for the current one when none is loaded', async () => {
				await runWithConnection(async (client, socket) => {
					const matrix = seedMatrix(client)

					socket.mockData(report({ target: 2, sources: [1], disposition: Pending }))
					expect(matrix.connections?.get(2)).toBeUndefined()

					socket.mockData(report({ target: 2, sources: [], disposition: Locked }))
					expect(matrix.connections?.get(2)).toEqual({ target: 2, sources: [], disposition: Locked })
				})
			})

			it('stores a first report by target, without its pending connections', async () => {
				await runWithConnection(async (client, socket) => {
					const matrix = seedMatrix(client)

					socket.mockData(
						report(
							{ target: 0, sources: [1], disposition: Tally },
							{ target: 1, sources: [2], disposition: Modified },
							{ target: 2, sources: [3], disposition: Pending },
							{ target: 3 }
						)
					)

					expect(matrix.connections).toEqual(
						connectionsOf([
							{ target: 0, sources: [1], disposition: Tally },
							{ target: 1, sources: [2], disposition: Modified },
							{ target: 3 },
						])
					)
				})
			})
		})
	})

	describe('StreamManager Integration', () => {
		it('registers stream parameter when subscribing', async () => {
			await runWithConnection(async (client, socket) => {
				const streamParam = createStreamParameter({
					identifier: 'test-stream',
					streamId: 1,
					value: 0.5,
					offset: 0,
				})

				const paramNode = new NumberedTreeNodeImpl(1, streamParam)

				// Subscribe to parameter
				const subscribeReq = await client.subscribe(paramNode)
				subscribeReq.response?.catch(() => null)

				expect(onSocketWrite).toHaveBeenCalledTimes(1)

				// Mock successful subscription
				socket.mockData(createQualifiedNodeResponse('1', streamParam, undefined))

				// Wait for registration to complete
				await new Promise(setImmediate)

				// Get StreamManager instance and check registration
				//@ts-expect-error - private method
				const streamManager = client._streamManager
				const streamInfo = streamManager.getStreamInfoByPath('1')

				expect(streamInfo).toBeDefined()
				expect(streamInfo?.parameter.streamIdentifier).toBe(1)
				expect(streamInfo?.parameter.value).toBe(0.5)
			})
		})

		it('deregisters stream parameter when unsubscribing', async () => {
			await runWithConnection(async (client, socket) => {
				const streamParam = createStreamParameter({
					identifier: 'test-stream',
					streamId: 1,
				})

				const paramNode = new NumberedTreeNodeImpl(1, streamParam)

				// First subscribe
				const subscribeReq = await client.subscribe(paramNode)
				subscribeReq.response?.catch(() => null)

				socket.mockData(createQualifiedNodeResponse('1', streamParam, undefined))

				await new Promise(setImmediate)

				// Then unsubscribe
				const unsubscribeReq = await client.unsubscribe(paramNode)
				unsubscribeReq.response?.catch(() => null)

				socket.mockData(createQualifiedNodeResponse('1', streamParam, undefined))

				// Mock receiving stream data
				const streamData = createStreamEntryResponse([
					{
						identifier: 1,
						value: { type: ParameterType.Real, value: 42.5 },
					},
				])
				socket.mockStreamData(streamData) // as a socket hands on a stream collection

				await new Promise(setImmediate)

				// Check parameter was deregistered
				//@ts-expect-error - private method
				const streamManager = client._streamManager
				const streamInfo = streamManager.getStreamInfoByPath('1')

				expect(streamInfo).toBeUndefined()
			})
		})

		it('processes stream data with specific offsets', async () => {
			await runWithConnection(async (client, socket) => {
				// Create test parameters with specific offsets
				const streamParam1 = createStreamParameter({
					identifier: 'test-stream1',
					streamId: 1,
					offset: 64,
					format: StreamFormat.Float32LE,
				})

				const streamParam2 = createStreamParameter({
					identifier: 'test-stream2',
					streamId: 1,
					offset: 68,
					format: StreamFormat.Float32LE,
				})

				const path1 = '1.3.17.3'
				const path2 = '1.3.18.3'

				// Create qualified element wrappers for the parameters
				const param1Element = new QualifiedElementImpl(path1, streamParam1)
				const param2Element = new QualifiedElementImpl(path2, streamParam2)

				// Subscribe to parameters using qualified elements
				const subscribe1 = await client.subscribe(param1Element)
				const subscribe2 = await client.subscribe(param2Element)

				subscribe1.response?.catch(() => null)
				subscribe2.response?.catch(() => null)

				// Mock successful subscriptions with qualified paths
				socket.mockData({
					value: [param1Element],
				})
				socket.mockData({
					value: [param2Element],
				})

				await new Promise(setImmediate)

				// Create the buffer with repeating values except last 8 bytes
				const buffer = Buffer.from([
					0x00,
					0x00,
					0x48,
					0xc3, // -200.0 repeated multiple times
					0x00,
					0x00,
					0x48,
					0xc3,
					0x00,
					0x00,
					0x48,
					0xc3,
					0x00,
					0x00,
					0x48,
					0xc3,
					0x00,
					0x00,
					0x48,
					0xc3,
					0x00,
					0x00,
					0x48,
					0xc3,
					0x00,
					0x00,
					0x48,
					0xc3,
					0x00,
					0x00,
					0x48,
					0xc3,
					0x00,
					0x00,
					0x48,
					0xc3,
					0x00,
					0x00,
					0x48,
					0xc3,
					0x00,
					0x00,
					0x48,
					0xc3,
					0x00,
					0x00,
					0x48,
					0xc3,
					0x00,
					0x00,
					0x48,
					0xc3,
					0x00,
					0x00,
					0x48,
					0xc3,
					0x00,
					0x00,
					0x48,
					0xc3,
					0x00,
					0x00,
					0x48,
					0xc3,
					0x74,
					0xb7,
					0x1e,
					0xc2, // -39.67915344238281 at offset 64
					0xb6,
					0xe1,
					0xbe,
					0xc1, // -23.860210418701172 at offset 68
				])

				// Get StreamManager instance and verify values
				//@ts-expect-error - private method
				const streamManager = client._streamManager

				const decoded: Array<StreamEntry> = [
					{
						identifier: 1,
						value: {
							type: ParameterType.Octets,
							value: buffer,
						},
					},
				]

				streamManager.updateStreamValues(decoded)
				const stream1 = streamManager.getStreamInfoByPath(path1)
				const stream2 = streamManager.getStreamInfoByPath(path2)

				expect(stream1?.parameter.value).toBeCloseTo(-39.67915344238281)
				expect(stream2?.parameter.value).toBeCloseTo(-23.860210418701172)
			})
		})

		describe('callbacks', () => {
			// A device, 1, with a meter, 1.1, that reports its level in stream 7
			function seedMeter(client: EmberClient) {
				const meter = new ParameterImpl(ParameterType.Integer, 'meter', undefined, 0)
				meter.streamIdentifier = 7
				const device = new NumberedTreeNodeImpl(
					1,
					new EmberNodeImpl('device'),
					childrenOf([new NumberedTreeNodeImpl(1, meter)])
				)
				if (!device.children?.get(1)) throw new Error('Expected seeded meter')
				childOf(device, 1).parent = device
				client.tree.set(1, device)
				return childOf(device, 1) as NumberedTreeNode<Parameter>
			}
			const level = (value: number) =>
				createStreamEntryResponse([{ identifier: 7, value: { type: ParameterType.Integer, value } }])

			it('calls the callback given to subscribe() with the parameter, for each stream value', async () => {
				await runWithConnection(async (client, socket) => {
					const node = seedMeter(client)
					const values: unknown[] = []
					const cb = vi.fn((update: TreeElement<EmberElement>) =>
						values.push((update.contents as Parameter).value)
					)
					const events: unknown[] = []
					client.on('streamUpdate', (path, value) => events.push([path, value]))

					await client.subscribe(node, cb)
					socket.mockStreamData(level(-18))
					socket.mockStreamData(level(-12))

					expect(cb).toHaveBeenCalledTimes(2)
					expect(cb).toHaveBeenLastCalledWith(node)
					expect(values).toEqual([-18, -12])
					expect(events).toEqual([
						['1.1', -18],
						['1.1', -12],
					])
				})
			})

			it('calls a callback registered for the path by getElementByPath too', async () => {
				await runWithConnection(async (client, socket) => {
					const node = seedMeter(client)
					const cb = vi.fn()

					await client.getElementByPath('1.1', cb)
					await client.subscribe(node)
					socket.mockStreamData(level(-18))

					expect(cb).toHaveBeenCalledTimes(1)
					expect(cb).toHaveBeenCalledWith(node)
				})
			})

			it('stops calling it once unsubscribed', async () => {
				await runWithConnection(async (client, socket) => {
					const node = seedMeter(client)
					const cb = vi.fn()

					await client.subscribe(node, cb)
					await client.unsubscribe(node)
					socket.mockStreamData(level(-18))

					expect(cb).not.toHaveBeenCalled()
				})
			})

			// An Unsubscribe on a node ends the subscriptions of its parameters too
			it('stops the stream values of a parameter once its node is unsubscribed', async () => {
				await runWithConnection(async (client, socket) => {
					const node = seedMeter(client)
					const cb = vi.fn()
					const events = vi.fn()
					client.on('streamUpdate', events)

					await client.subscribe(node, cb)
					await client.unsubscribe(at([...client.tree.values()], 0))
					socket.mockStreamData(level(-18))

					expect(cb).not.toHaveBeenCalled()
					expect(events).not.toHaveBeenCalled()
				})
			})
		})
	})

	describe('Matrix requests', () => {
		// A matrix is a leaf, so a provider's reply to a GetDirectory on it doesn't have to include children
		it('resolves a GetDirectory on a matrix when the reply has no children', async () => {
			await runWithConnection(async (client, socket) => {
				const router = new NumberedTreeNodeImpl(
					1,
					new EmberNodeImpl('router'),
					childrenOf([new NumberedTreeNodeImpl(1, new MatrixImpl('matrix'))])
				)
				if (!router.children?.get(1)) throw new Error('Expected seeded matrix')
				childOf(router, 1).parent = router
				socket.mockData({ value: [router] })
				await new Promise(setImmediate)

				const request = await client.getDirectory(new QualifiedElementImpl('1.1', new MatrixImpl('matrix')))
				socket.mockData(
					createQualifiedNodeResponse(
						'1.1',
						new MatrixImpl('matrix', undefined, undefined, connectionsOf([{ target: 0, sources: [1] }])),
						undefined
					)
				)

				await expect(request.response).resolves.toBeDefined()
			})
		})
	})

	// Glow DTD: a function's children only ever hold a command (an invocation), and a template has no children at all,
	// so a provider's reply to a GetDirectory on either doesn't have to include any
	describe('GetDirectory on a function or a template', () => {
		it.each<[string, () => EmberElement]>([
			[
				'a function',
				() => new EmberFunctionImpl('add', 'Add', [new FunctionArgumentImpl(ParameterType.Integer, 'a')]),
			],
		])('resolves for %s when the reply has no children', async (_, contents) => {
			await runWithConnection(async (client, socket) => {
				const device = new NumberedTreeNodeImpl(
					1,
					new EmberNodeImpl('device'),
					childrenOf([new NumberedTreeNodeImpl(1, contents())])
				)
				if (!device.children?.get(1)) throw new Error('Expected seeded element')
				childOf(device, 1).parent = device
				socket.mockData({ value: [device] })
				await new Promise(setImmediate)

				const request = await client.getDirectory(childOf(device, 1))
				socket.mockData(createQualifiedNodeResponse('1.1', contents(), undefined))

				await expect(request.response).resolves.toBe(childOf(device, 1))
			})
		})

		// A template's encoding has no children to carry a command. The request went as a bare QualifiedTemplate,
		// without the command, and waited for a reply until it timed out.
		it('refuses a template, sending nothing and keeping no callback', async () => {
			await runWithConnection(async (client, socket) => {
				const template = new NumberedTreeNodeImpl(1, new TemplateImpl(undefined, 'Channel template'))
				client.tree.set(1, template) // so that a report on it is a change at its path
				const cb = vi.fn()

				await expect(client.getDirectory(template, undefined, cb)).rejects.toThrow(
					'Cannot send a command to a template'
				)
				await expect(client.subscribe(template, cb)).rejects.toThrow('Cannot send a command to a template')
				expect(onSocketWrite).not.toHaveBeenCalled()

				socket.mockData(createQualifiedNodeResponse('1', new TemplateImpl(undefined, 'Changed'), undefined))
				await new Promise(setImmediate)
				expect(cb).not.toHaveBeenCalled()
			})
		})
	})

	// A reported qualified element that isn't in the tree yet goes into it as a numbered element. It went in as a copy
	// of the qualified one, keeping its path, and its children kept the reported element as their parent: walking up
	// from them left the tree there.
	describe('a qualified element put into the tree', () => {
		const reported = (path: RelativeOID) =>
			createQualifiedNodeResponse(
				path,
				new EmberNodeImpl('channel'),
				childrenOf([
					new NumberedTreeNodeImpl(3, new ParameterImpl(ParameterType.Integer, 'gain', undefined, 0)),
				])
			)

		test.each<[string, RelativeOID, (client: EmberClient) => NumberedTreeNode<EmberElement> | undefined]>([
			['below a loaded element', '1.2', (client) => client.tree.get(1)?.children?.get(2)],
			['at the top', '2', (client) => client.tree.get(2)],
		])('%s is a numbered element, the parent of its children', async (_, path, inserted) => {
			await runWithConnection(async (client, socket) => {
				client.tree.set(1, new NumberedTreeNodeImpl(1, new EmberNodeImpl('device'), new Map()))
				socket.mockData(reported(path))
				await new Promise(setImmediate)

				const element = inserted(client)
				if (!element) throw new Error('Expected the element in the tree')
				expect(isQualified(element)).toBe(false)
				const child = childOf(element, 3)
				expect(child.parent).toBe(element)
				expect(client.getInternalNodePath(child)).toBe(`${path}.3`)
			})
		})
	})

	// A qualified element, as a report about part of the tree that isn't loaded reaches a callback: unsubscribe and
	// expand take one, as getDirectory and subscribe do. They took only a numbered element.
	describe('unsubscribe and expand on a qualified element', () => {
		/** The path and command of what was last sent */
		const lastSent = () => {
			const calls = onSocketWrite.mock.calls
			const element = firstElement(at(calls, calls.length - 1)[0])
			const command = at([...(element.children?.values() ?? [])], 0).contents
			if (!isQualified(element) || command.type !== ElementType.Command) throw new Error('Expected a command')
			return [element.path, command.number]
		}

		it('unsubscribe sends an Unsubscribe for its path', async () => {
			await runWithConnection(async (client) => {
				const gain = new QualifiedElementImpl('1.2', new ParameterImpl(ParameterType.Integer, 'gain'))
				await client.unsubscribe(gain)

				expect(lastSent()).toEqual(['1.2', CommandType.Unsubscribe])
			})
		})

		it('expand asks for the directories below it, by their paths below its own', async () => {
			await runWithConnection(async (client, socket) => {
				const channel = new NumberedTreeNodeImpl(1, new EmberNodeImpl('channel'))
				const device = new QualifiedElementImpl('5', new EmberNodeImpl('device'), childrenOf([channel]))
				channel.parent = device
				const expanding = client.expand(device)
				await new Promise(setImmediate)

				expect(lastSent()).toEqual(['5.1', CommandType.GetDirectory])
				socket.mockData(createQualifiedNodeResponse('5.1', new EmberNodeImpl(), undefined)) // no children
				await expanding
			})
		})
	})

	// #68: a request about an element the tree doesn't have yet, such as the parameters node of an inline
	// parametersLocation (which a GetDirectory on the matrix doesn't list) or a path the caller builds. The reply put
	// the element into the tree, but made a change only at its parent's path, so the request timed out.
	describe('a request about an element the tree does not have yet', () => {
		const parametersNode = () =>
			createQualifiedNodeResponse(
				'1.7',
				new EmberNodeImpl(),
				childrenOf([new NumberedTreeNodeImpl(1, new EmberNodeImpl('targets'))])
			)

		it('is answered by the reply, below an element the tree has', async () => {
			await runWithConnection(async (client, socket) => {
				const device = new NumberedTreeNodeImpl(1, new EmberNodeImpl('device'), new Map())
				client.tree.set(1, device)
				const cb = vi.fn()

				const request = await client.getDirectory(
					new QualifiedElementImpl('1.7', new EmberNodeImpl()),
					undefined,
					cb
				)
				socket.mockData(parametersNode())

				const inserted = device.children?.get(7)
				await expect(request.response).resolves.toBe(inserted)
				expect(inserted?.parent).toBe(device)
				expect(cb).toHaveBeenCalledTimes(1)
				expect(cb).toHaveBeenCalledWith(inserted)
			})
		})

		it('is answered by the reply, at the top of the tree', async () => {
			await runWithConnection(async (client, socket) => {
				client.tree.set(1, new NumberedTreeNodeImpl(1, new EmberNodeImpl('device')))

				const request = await client.getDirectory(new QualifiedElementImpl('2', new EmberNodeImpl()))
				socket.mockData(
					createQualifiedNodeResponse(
						'2',
						new EmberNodeImpl('other'),
						childrenOf([new NumberedTreeNodeImpl(1, new EmberNodeImpl('child'))])
					)
				)

				await expect(request.response).resolves.toBe(client.tree.get(2))
			})
		})

		it("is answered by a connection report on a matrix the tree doesn't have", async () => {
			await runWithConnection(async (client, socket) => {
				client.tree.set(1, new NumberedTreeNodeImpl(1, new EmberNodeImpl('device'), new Map()))

				const matrix = new QualifiedElementImpl<Matrix>('1.4', { type: ElementType.Matrix })
				const request = await client.matrixConnect(matrix, 2, [3])
				socket.mockData(
					createQualifiedNodeResponse(
						'1.4',
						new MatrixImpl(undefined, undefined, undefined, connectionsOf([{ target: 2, sources: [3] }])),
						undefined
					)
				)

				await expect(request.response).resolves.toBe(client.tree.get(1)?.children?.get(4))
			})
		})
	})

	// getElementByPath found nothing until the caller had loaded the top level with a GetDirectory on the root
	describe('getElementByPath and the top level', () => {
		// A provider whose top level is the node 1, "device": counts the GetDirectory requests on the root it answers
		function answerRootRequests(socket: S101ClientMock, answer = () => true) {
			const counted = { rootRequests: 0 }
			onSocketWrite.mockImplementation((data: Buffer) => {
				const request = firstElement(data)
				if (isQualified(request) || request.contents.type !== ElementType.Command) return true
				counted.rootRequests++
				if (answer()) {
					setImmediate(() =>
						socket.mockData({ value: [new NumberedTreeNodeImpl(1, new EmberNodeImpl('device'))] })
					)
				}
				return true
			})
			return counted
		}
		afterEach(() => onSocketWrite.mockReset())

		it('loads the top level when it has not been, then finds the element', async () => {
			await runWithConnection(async (client, socket) => {
				const counted = answerRootRequests(socket)

				const found = await client.getElementByPath('device')

				expect(found).toBe(client.tree.get(1))
				expect(counted.rootRequests).toBe(1)
			})
		})

		it('loads it once for lookups made together', async () => {
			await runWithConnection(async (client, socket) => {
				const counted = answerRootRequests(socket)

				const found = await Promise.all([client.getElementByPath('device'), client.getElementByPath('1')])

				expect(found).toEqual([client.tree.get(1), client.tree.get(1)])
				expect(counted.rootRequests).toBe(1)
			})
		})

		it('does not load it again once it has been', async () => {
			await runWithConnection(async (client, socket) => {
				const counted = answerRootRequests(socket)

				await client.getElementByPath('device')
				await expect(client.getElementByPath('other')).resolves.toBeUndefined()

				expect(counted.rootRequests).toBe(1)
			})
		})

		it('does not load it when the top level has the first element', async () => {
			await runWithConnection(async (client, socket) => {
				const counted = answerRootRequests(socket)
				client.tree.set(1, new NumberedTreeNodeImpl(1, new EmberNodeImpl('device')))

				await expect(client.getElementByPath('device')).resolves.toBe(client.tree.get(1))
				expect(counted.rootRequests).toBe(0)
			})
		})

		it('loads it again after an attempt that failed', async () => {
			await runWithConnection(
				async (client, socket) => {
					let attempts = 0
					const counted = answerRootRequests(socket, () => ++attempts > 1) // the first goes unanswered

					await expect(client.getElementByPath('device')).rejects.toThrow('Request timed out')
					const found = await client.getElementByPath('device')

					expect(found).toBe(client.tree.get(1))
					expect(counted.rootRequests).toBe(2)
				},
				{ timeout: 300 }
			)
		})
	})

	// #69: a GetDirectory on a node without children is answered with the node "without any properties set" (Glow ›
	// Commands › GetDirectory), which says it has none. When the node's parent, or its device, wasn't loaded, that
	// answer wasn't taken as one, and the request waited for children until it timed out.
	describe('an empty node answering a GetDirectory', () => {
		test.each<[string, (client: EmberClient) => void]>([
			['nothing is loaded', () => undefined],
			[
				'only its device is loaded',
				(client) => {
					client.tree.set(1, new NumberedTreeNodeImpl(1, new EmberNodeImpl('device'), new Map()))
				},
			],
			[
				'the node above it is loaded',
				(client) => {
					const labels = new NumberedTreeNodeImpl(0, new EmberNodeImpl('labels'))
					const device = new NumberedTreeNodeImpl(1, new EmberNodeImpl('device'), childrenOf([labels]))
					labels.parent = device
					client.tree.set(1, device)
				},
			],
		])('settles the request when %s', async (_, seed) => {
			await runWithConnection(
				async (client, socket) => {
					seed(client)

					const request = await client.getDirectory(new QualifiedElementImpl('1.0.1', new EmberNodeImpl()))
					socket.mockData(createQualifiedNodeResponse('1.0.1', new EmberNodeImpl(), undefined))

					await expect(request.response).resolves.toMatchObject({ contents: { type: ElementType.Node } })
				},
				{ timeout: 300 }
			)
		})

		it('still waits for children after a report with properties, as the spec has it', async () => {
			await runWithConnection(
				async (client, socket) => {
					const request = await client.getDirectory(new QualifiedElementImpl('1.0.1', new EmberNodeImpl()))
					socket.mockData(createQualifiedNodeResponse('1.0.1', new EmberNodeImpl('targets'), undefined))

					await expect(request.response).rejects.toThrow('Request timed out')
				},
				{ timeout: 300 }
			)
		})

		it('lets getMatrixLabels give an empty label set', async () => {
			await runWithConnection(async (client, socket) => {
				onSocketWrite.mockImplementation((data: Buffer) => {
					const request = firstElement(data)
					if (isQualified(request)) {
						setImmediate(() =>
							socket.mockData(createQualifiedNodeResponse(request.path, new EmberNodeImpl(), undefined))
						)
					}
					return true
				})
				const matrix = new QualifiedElementImpl<Matrix>('2.4', {
					type: ElementType.Matrix,
					labels: [{ basePath: '5.3', description: 'Spare' }], // nothing of 5 loaded
				})

				try {
					await expect(client.getMatrixLabels(matrix)).resolves.toEqual([
						{ basePath: '5.3', description: 'Spare', targets: {}, sources: {} },
					])
				} finally {
					onSocketWrite.mockReset()
				}
			})
		})
	})

	describe('matrix helpers', () => {
		const labels = (kind: string, values: { [signal: number]: string | null }) =>
			new NumberedTreeNodeImpl(
				0,
				new EmberNodeImpl(kind),
				childrenOf(
					Object.entries<string | null>(values).map(
						([n, value]) =>
							new NumberedTreeNodeImpl(
								Number(n),
								new ParameterImpl(ParameterType.String, undefined, undefined, value)
							)
					)
				)
			)
		// A provider holding the label nodes by path: each GetDirectory sent is answered with the node at its path
		function answerLabelRequests(
			socket: S101ClientMock,
			nodes: { [path: string]: NumberedTreeNode<EmberElement> }
		) {
			const asked: Array<string> = []
			onSocketWrite.mockImplementation((data: Buffer) => {
				const request = firstElement(data)
				if (!isQualified(request)) return true
				asked.push(request.path)
				const node = nodes[request.path]
				if (node)
					setImmediate(() =>
						socket.mockData(createQualifiedNodeResponse(request.path, node.contents, node.children))
					)
				return true
			})
			return asked
		}
		afterEach(() => onSocketWrite.mockReset())

		it('getMatrixLabels gives every label set, in the order the matrix lists them', async () => {
			await runWithConnection(async (client, socket) => {
				const matrix = new QualifiedElementImpl<Matrix>('1.4', {
					type: ElementType.Matrix,
					labels: [
						{ basePath: '1.0', description: 'Primary' },
						{ basePath: '1.5', description: 'Internal' },
					],
				})
				const asked = answerLabelRequests(socket, {
					'1.0.1': labels('targets', { 1: 'T1', 2: 'T2', 3: null }), // a null label is left out
					'1.0.2': labels('sources', { 1: 'S1' }),
					'1.5.1': labels('targets', { 1: '  Internal T1 ' }), // as reported, padding kept
					'1.5.2': labels('sources', {}),
				})

				const sets: Array<LabelSet> = await client.getMatrixLabels(matrix)

				expect(sets).toEqual([
					{ basePath: '1.0', description: 'Primary', targets: { 1: 'T1', 2: 'T2' }, sources: { 1: 'S1' } },
					{ basePath: '1.5', description: 'Internal', targets: { 1: '  Internal T1 ' }, sources: {} },
				])
				expect(asked).toEqual(['1.0.1', '1.0.2', '1.5.1', '1.5.2'])
			})
		})

		it('getMatrixLabels gives none for a matrix without labels, sending nothing', async () => {
			await runWithConnection(async (client) => {
				const matrix = new QualifiedElementImpl<Matrix>('1.4', { type: ElementType.Matrix })

				await expect(client.getMatrixLabels(matrix)).resolves.toEqual([])
				expect(onSocketWrite).not.toHaveBeenCalled()
			})
		})

		it('getMatrixLabels rejects when a request fails', async () => {
			await runWithConnection(
				async (client, socket) => {
					const matrix = new QualifiedElementImpl<Matrix>('1.4', {
						type: ElementType.Matrix,
						labels: [{ basePath: '1.0', description: 'Primary' }],
					})
					answerLabelRequests(socket, { '1.0.1': labels('targets', { 1: 'T1' }) }) // no sources node

					await expect(client.getMatrixLabels(matrix)).rejects.toThrow('Request timed out')
				},
				{ timeout: 300 }
			)
		})

		describe('the paths of the parameters of signals and connections', () => {
			const device = new NumberedTreeNodeImpl(1, new EmberNodeImpl('device'))
			const matrix = (parametersLocation?: RelativeOID | number, gainParameterNumber?: number) => {
				const contents: Matrix = { type: ElementType.Matrix, parametersLocation, gainParameterNumber }
				return new NumberedTreeNodeImpl(4, contents, undefined, device)
			}

			test.each<[string, RelativeOID | number]>([
				['a path', '1.2'],
				["an inline number, after the matrix's own path", 7],
			])('from %s', async (_, location) => {
				await runWithConnection(async (client) => {
					const base = typeof location === 'number' ? `1.4.${location}` : location
					const m = matrix(location, 1)

					expect(client.matrixParametersPath(m)).toBe(base)
					expect(client.matrixTargetParametersPath(m, 3)).toBe(`${base}.1.3`)
					expect(client.matrixSourceParametersPath(m, 6)).toBe(`${base}.2.6`)
					expect(client.matrixConnectionParametersPath(m, 9, 12)).toBe(`${base}.3.9.12`)
					expect(client.matrixConnectionGainPath(m, 9, 12)).toBe(`${base}.3.9.12.1`)
				})
			})

			it('are undefined without a parametersLocation, and the gain without a gainParameterNumber', async () => {
				await runWithConnection(async (client) => {
					expect(client.matrixParametersPath(matrix())).toBeUndefined()
					expect(client.matrixTargetParametersPath(matrix(), 3)).toBeUndefined()
					expect(client.matrixConnectionParametersPath(matrix(), 9, 12)).toBeUndefined()
					expect(client.matrixConnectionGainPath(matrix('1.2'), 9, 12)).toBeUndefined()
				})
			})
		})
	})

	describe('GetDirectory on the root of a loaded tree', () => {
		// A device, 1, with a parameter, 1.1, already loaded
		function seedDevice(client: EmberClient) {
			const device = new NumberedTreeNodeImpl(
				1,
				new EmberNodeImpl('device'),
				childrenOf([
					new NumberedTreeNodeImpl(1, new ParameterImpl(ParameterType.Integer, 'gain', undefined, 0)),
				])
			)
			if (!device.children?.get(1)) throw new Error('Expected seeded parameter')
			childOf(device, 1).parent = device
			client.tree.set(1, device)
			return { device, parameter: childOf(device, 1) }
		}

		// A reply to a GetDirectory on the root lists the top-level elements without their children: numbered, or
		// qualified as a test device sends them
		test.each<[string, () => DecodeResult<Root>]>([
			['numbered', () => ({ value: [new NumberedTreeNodeImpl(1, new EmberNodeImpl('device'))], errors: [] })],
			['qualified', () => createQualifiedNodeResponse('1', new EmberNodeImpl('device'), undefined)],
		])('resolves, and keeps what is loaded below, when the reply is %s', async (_, reply) => {
			await runWithConnection(async (client, socket) => {
				const { device, parameter } = seedDevice(client)

				const request = await client.getDirectory(client.tree)
				let response: unknown = 'pending'
				request.response?.then((r) => (response = r)).catch(() => null)
				socket.mockData(reply())
				await new Promise(setImmediate)

				expect(response).toBe(device)
				expect(client.tree.get(1)).toBe(device)
				expect(device.children?.get(1)).toBe(parameter)
			})
		})
	})

	// A provider may report an element whose parent the consumer hasn't loaded, as when it answers a setValue sent
	// by path. The tree has only the device, 1, without its children.
	describe('a qualified element below a node that is not loaded', () => {
		const gain = (value: number) => new ParameterImpl(ParameterType.Integer, 'gain', undefined, value)
		const report = (value: number) => createQualifiedNodeResponse('1.1.1', gain(value), undefined)

		it('resolves the request for that element', async () => {
			await runWithConnection(async (client, socket) => {
				client.tree.set(1, new NumberedTreeNodeImpl(1, new EmberNodeImpl('device')))

				const request = await client.setValue(new QualifiedElementImpl('1.1.1', gain(0)), 6)
				let response: unknown = 'pending'
				request.response?.then((r) => (response = r)).catch(() => null)
				socket.mockData(report(6))
				await new Promise(setImmediate)

				expect(response).toMatchObject({ path: '1.1.1', contents: { value: 6 } })
			})
		})

		it('calls the callbacks for that element', async () => {
			await runWithConnection(async (client, socket) => {
				client.tree.set(1, new NumberedTreeNodeImpl(1, new EmberNodeImpl('device')))
				const values: unknown[] = []
				await client.subscribe(new QualifiedElementImpl('1.1.1', gain(0)), (node) =>
					values.push((node.contents as Parameter).value)
				)

				socket.mockData(report(6))
				await new Promise(setImmediate)

				expect(values).toEqual([6])
			})
		})

		it('does not put the element in the place of the node that is missing', async () => {
			await runWithConnection(async (client, socket) => {
				const device = new NumberedTreeNodeImpl(1, new EmberNodeImpl('device'))
				client.tree.set(1, device)

				socket.mockData(report(6))
				await new Promise(setImmediate)

				expect(device.children?.get(1)).toBeUndefined()
			})
		})

		it('still adds an element whose parent is loaded', async () => {
			await runWithConnection(async (client, socket) => {
				const channel = new NumberedTreeNodeImpl(1, new EmberNodeImpl('channel'), new Map())
				client.tree.set(1, new NumberedTreeNodeImpl(1, new EmberNodeImpl('device'), childrenOf([channel])))
				channel.parent = client.tree.get(1)

				socket.mockData(report(6))
				await new Promise(setImmediate)

				expect(channel.children?.get(1)).toMatchObject({ number: 1, contents: { value: 6 } })
			})
		})
	})

	// Ember+ specification, Notifications: a provider reports changes to any property of an element, and a property it
	// leaves out of an update is unchanged
	// One message is one change of an element: its contents and its first children together
	describe('callbacks for the first reply that brings children', () => {
		/** A device, 1, with the element at 1.1, loaded without children, and a callback registered for 1.1 */
		async function seedWithCallback<T extends EmberElement>(client: EmberClient, contents: T) {
			const element = new NumberedTreeNodeImpl(1, contents)
			const device = new NumberedTreeNodeImpl(1, new EmberNodeImpl('device'), childrenOf([element]))
			element.parent = device
			client.tree.set(1, device)
			const calls: unknown[] = []
			const request = await client.getDirectory(element, undefined, (node) => calls.push(node))
			request.response?.catch(() => null)
			return { element, calls }
		}

		// As the library's own EmberServer answers a GetDirectory on a parameter
		it('calls a parameter callback once for a reply with an empty set of children', async () => {
			await runWithConnection(async (client, socket) => {
				const { element, calls } = await seedWithCallback(
					client,
					new ParameterImpl(ParameterType.Integer, 'gain')
				)

				socket.mockData(
					createQualifiedNodeResponse(
						'1.1',
						new ParameterImpl(ParameterType.Integer, 'gain', undefined, 3),
						new Map()
					)
				)
				await new Promise(setImmediate)
				socket.mockData(
					createQualifiedNodeResponse(
						'1.1',
						new ParameterImpl(ParameterType.Integer, 'gain', undefined, 4),
						new Map()
					)
				)
				await new Promise(setImmediate)

				expect(calls).toEqual([element, element])
				expect(element.contents.value).toBe(4)
			})
		})

		it('calls a node callback once for the reply that brings its children', async () => {
			await runWithConnection(async (client, socket) => {
				const { element, calls } = await seedWithCallback(client, new EmberNodeImpl('channel'))

				socket.mockData(
					createQualifiedNodeResponse(
						'1.1',
						new EmberNodeImpl('channel'),
						childrenOf([new NumberedTreeNodeImpl(1, new ParameterImpl(ParameterType.Integer, 'gain'))])
					)
				)
				await new Promise(setImmediate)

				expect(calls).toEqual([element])
				expect(element.children?.get(1)?.contents).toMatchObject({ identifier: 'gain' })
			})
		})
	})

	describe('updates to properties other than the value', () => {
		/** A device, 1, with the element at 1.1, as loaded */
		function seed<T extends EmberElement>(client: EmberClient, contents: T): NumberedTreeNode<T> {
			const element = new NumberedTreeNodeImpl(1, contents)
			const device = new NumberedTreeNodeImpl(1, new EmberNodeImpl('device'), childrenOf([element]))
			element.parent = device
			client.tree.set(1, device)
			return element
		}

		it('takes every property a parameter update holds, and keeps the others', async () => {
			await runWithConnection(async (client, socket) => {
				const parameter = new ParameterImpl(ParameterType.Integer, 'gain', 'Gain', 5, 10, 0)
				parameter.format = '%d dB'
				const { contents } = seed(client, parameter)

				const update = new ParameterImpl(ParameterType.Integer, undefined, 'Gain (L)', undefined, 20, -20)
				update.enumMap = new Map([['unity', 0]])
				update.formula = '$*2\n$/2'
				update.step = 2
				socket.mockData(createQualifiedNodeResponse('1.1', update, undefined))
				await new Promise(setImmediate)

				expect(contents).toMatchObject({
					identifier: 'gain',
					description: 'Gain (L)',
					value: 5,
					maximum: 20,
					minimum: -20,
					format: '%d dB',
					enumMap: new Map([['unity', 0]]),
					formula: '$*2\n$/2',
					step: 2,
				})
			})
		})

		// When a provider leaves the type out, the decoder infers one from the value: an enumeration's value is an
		// integer. So the type in an update can't be told from a guess.
		it("keeps a parameter's type", async () => {
			await runWithConnection(async (client, socket) => {
				const { contents } = seed(client, new ParameterImpl(ParameterType.Enum, 'mode', undefined, 0))

				const decoded = berDecode(
					berEncode(
						[
							new QualifiedElementImpl(
								'1.1',
								new ParameterImpl(ParameterType.Integer, undefined, undefined, 2)
							),
						],
						RootType.Elements
					)
				)
				socket.mockData(decoded)
				await new Promise(setImmediate)

				expect(contents).toMatchObject({ parameterType: ParameterType.Enum, value: 2 })
			})
		})

		// A parameter's value is of its type's form: an update's value or default that doesn't fit the cached parameter's
		// type is not applied, with a warning. Both were stored as they came.
		it("doesn't apply a value or default that doesn't fit the parameter's type, and warns", async () => {
			await runWithConnection(async (client, socket) => {
				const { contents } = seed(client, new ParameterImpl(ParameterType.Integer, 'gain', undefined, 5))
				const warnings: string[] = []
				client.on('warn', (e) => warnings.push(e.message))

				const update = new ParameterImpl(ParameterType.String, undefined, 'Gain', 'loud')
				update.defaultValue = 'quiet'
				socket.mockData(createQualifiedNodeResponse('1.1', update, undefined))
				await new Promise(setImmediate)

				expect(contents).toMatchObject({ parameterType: ParameterType.Integer, value: 5, description: 'Gain' })
				expect(contents.defaultValue).toBeUndefined()
				expect(warnings).toEqual([
					expect.stringContaining("1.1: a value loud doesn't fit a parameter of the type INTEGER"),
					expect.stringContaining("1.1: a defaultValue quiet doesn't fit a parameter of the type INTEGER"),
				])
			})
		})

		it('applies a null value to a parameter of any type', async () => {
			await runWithConnection(async (client, socket) => {
				const { contents } = seed(client, new ParameterImpl(ParameterType.Boolean, 'mute', undefined, true))

				socket.mockData(
					createQualifiedNodeResponse(
						'1.1',
						new ParameterImpl(ParameterType.Null, undefined, undefined, null),
						undefined
					)
				)
				await new Promise(setImmediate)

				expect(contents).toMatchObject({ parameterType: ParameterType.Boolean, value: null })
			})
		})

		it('takes the properties of a node update', async () => {
			await runWithConnection(async (client, socket) => {
				const { contents } = seed(client, new EmberNodeImpl('input', 'Input', undefined, true))

				socket.mockData(createQualifiedNodeResponse('1.1', new EmberNodeImpl(undefined, 'Input 1'), undefined))
				await new Promise(setImmediate)

				expect(contents).toMatchObject({ identifier: 'input', description: 'Input 1', isOnline: true })
			})
		})

		it('takes the properties of a matrix update, and still merges its connections by target', async () => {
			await runWithConnection(async (client, socket) => {
				const matrix = new MatrixImpl(
					'router',
					signalsOf([0, 1]),
					signalsOf([0, 1]),
					connectionsOf([new ConnectionImpl(0, [0]), new ConnectionImpl(1, [1])])
				)
				const { contents } = seed(client, matrix)

				const update = new MatrixImpl(
					undefined,
					undefined,
					undefined,
					connectionsOf([new ConnectionImpl(0, [1])])
				)
				update.description = 'Main router'
				update.labels = [new LabelImpl('1.2.1', 'Primary')]
				socket.mockData(createQualifiedNodeResponse('1.1', update, undefined))
				await new Promise(setImmediate)

				expect(contents).toMatchObject({
					identifier: 'router',
					description: 'Main router',
					labels: [{ basePath: '1.2.1', description: 'Primary' }],
				})
				expect(contents.connections?.get(0)?.sources).toEqual([1])
				expect(contents.connections?.get(1)?.sources).toEqual([1])
			})
		})

		it('takes the properties of a function update', async () => {
			await runWithConnection(async (client, socket) => {
				const { contents } = seed(
					client,
					new EmberFunctionImpl('add', 'Add', [new FunctionArgumentImpl(ParameterType.Integer, 'a')])
				)

				const args = [
					new FunctionArgumentImpl(ParameterType.Integer, 'a'),
					new FunctionArgumentImpl(ParameterType.Integer, 'b'),
				]
				socket.mockData(
					createQualifiedNodeResponse('1.1', new EmberFunctionImpl(undefined, undefined, args), undefined)
				)
				await new Promise(setImmediate)

				expect(contents).toMatchObject({ identifier: 'add', description: 'Add', args })
			})
		})

		it('routes a stream to a subscribed parameter by its new stream identifier', async () => {
			await runWithConnection(async (client, socket) => {
				const parameter = new ParameterImpl(ParameterType.Integer, 'meter', undefined, 0)
				parameter.streamIdentifier = 5
				const element = seed(client, parameter)
				const subscribed = await client.subscribe(element)
				subscribed.response?.catch(() => null)

				const update = new ParameterImpl(ParameterType.Integer)
				update.streamIdentifier = 6
				socket.mockData(createQualifiedNodeResponse('1.1', update, undefined))
				await new Promise(setImmediate)
				socket.mockStreamData(
					createStreamEntryResponse([{ identifier: 5, value: { type: ParameterType.Integer, value: -50 } }])
				)
				socket.mockStreamData(
					createStreamEntryResponse([{ identifier: 6, value: { type: ParameterType.Integer, value: -12 } }])
				)
				await new Promise(setImmediate)

				expect(parameter.streamIdentifier).toBe(6)
				expect(parameter.value).toBe(-12)
			})
		})
	})

	describe('subscriptions after a reconnect', () => {
		// The connection drops, and the client connects again on its own
		async function reconnect(socket: S101ClientMock) {
			socket.mockClose()
			await socket.connect()
			await new Promise(setImmediate)
		}

		// What each write asked the provider for: the path ('' for the root) and the command
		function sentCommands(): Array<[string, CommandType]> {
			return onSocketWrite.mock.calls.map(([data]) => {
				const element = firstElement(data)
				if (element.contents.type === ElementType.Command) return ['', element.contents.number]
				const command = at([...(element.children?.values() ?? [])], 0).contents
				if (command.type !== ElementType.Command || !isQualified(element)) {
					throw new Error('Expected a command request')
				}
				return [element.path, command.number]
			})
		}

		const deviceReply = (value: number) =>
			createQualifiedNodeResponse(
				'1',
				new EmberNodeImpl('device'),
				childrenOf([
					new NumberedTreeNodeImpl(1, new ParameterImpl(ParameterType.Integer, 'gain', undefined, value)),
				])
			)

		// Loads the root and looks up the parameter 1.1, as a consumer does
		async function lookUpParameter(client: EmberClient, socket: S101ClientMock, cb?: () => void) {
			const root = await client.getDirectory(client.tree)
			socket.mockData({ value: [new NumberedTreeNodeImpl(1, new EmberNodeImpl('device'))] })
			await root.response
			const lookup = client.getElementByPath('1.1', cb)
			await new Promise(setImmediate)
			socket.mockData(deviceReply(0))
			const parameter = await lookup
			if (!parameter) throw new Error('Expected the parameter')
			return parameter as NumberedTreeNode<EmberElement>
		}

		it('asks again for each directory it had asked for, the root first', async () => {
			await runWithConnection(async (client, socket) => {
				await lookUpParameter(client, socket)
				onSocketWrite.mockClear()

				await reconnect(socket)

				expect(sentCommands()).toEqual([
					['', CommandType.GetDirectory],
					['1', CommandType.GetDirectory],
					['1.1', CommandType.GetDirectory],
				])
			})
		})

		it('passes what the provider reports again to the callbacks, in the loaded tree', async () => {
			await runWithConnection(async (client, socket) => {
				const cb = vi.fn()
				const parameter = await lookUpParameter(client, socket, cb)
				cb.mockClear()

				// The provider answers the requests sent again, with a value that changed while disconnected
				await reconnect(socket)
				socket.mockData({ value: [new NumberedTreeNodeImpl(1, new EmberNodeImpl('device'))] })
				socket.mockData(deviceReply(7))
				await new Promise(setImmediate)

				expect(cb).toHaveBeenCalledWith(parameter)
				expect(client.tree.get(1)?.children?.get(1)).toBe(parameter)
				expect((parameter.contents as Parameter).value).toBe(7)
			})
		})

		it('asks again for what it had subscribed to', async () => {
			await runWithConnection(async (client, socket) => {
				const parameter = await lookUpParameter(client, socket)
				await client.subscribe(parameter)
				onSocketWrite.mockClear()

				await reconnect(socket)

				expect(sentCommands()).toContainEqual(['1.1', CommandType.Subscribe])
			})
		})

		it('does not ask again for what it has unsubscribed from', async () => {
			await runWithConnection(async (client, socket) => {
				const parameter = await lookUpParameter(client, socket)
				await client.subscribe(parameter)
				await client.unsubscribe(parameter)
				onSocketWrite.mockClear()

				await reconnect(socket)

				expect(sentCommands()).toEqual([
					['', CommandType.GetDirectory],
					['1', CommandType.GetDirectory],
				])
			})
		})

		// Ember+ specification, Unsubscribe: "When applied to a node, it indicates that the consumer is no longer
		// interested in receiving value updates from the parameters that are located below this node. In that case, all
		// parameter subscriptions for that consumer must be removed."
		it('does not ask again for the parameters of a node it has unsubscribed from', async () => {
			await runWithConnection(async (client, socket) => {
				const parameter = await lookUpParameter(client, socket)
				await client.subscribe(parameter)
				await client.unsubscribe(at([...client.tree.values()], 0))
				onSocketWrite.mockClear()

				await reconnect(socket)

				expect(sentCommands()).toEqual([['', CommandType.GetDirectory]])
			})
		})

		it('does not ask again for the top-level parameters when it has unsubscribed from the root', async () => {
			await runWithConnection(async (client, socket) => {
				const parameter = new NumberedTreeNodeImpl(1, new ParameterImpl(ParameterType.Integer, 'level'))
				client.tree.set(1, parameter)
				await client.subscribe(parameter)
				const unsubscribe = await client.unsubscribe(client.tree)
				unsubscribe.response?.catch(() => null) // no reply here, so the request is cancelled on disconnect
				onSocketWrite.mockClear()

				await reconnect(socket)

				expect(sentCommands()).toEqual([])
			})
		})

		// Only the node's own parameters: what was asked for further down has its own nodes to unsubscribe from
		it('still asks again for what is below the nodes of a node it has unsubscribed from', async () => {
			await runWithConnection(async (client, socket) => {
				// a device, 1, with a channel, 1.1, holding a parameter, 1.1.1
				const gain = new NumberedTreeNodeImpl(1, new ParameterImpl(ParameterType.Integer, 'gain'))
				const channel = new NumberedTreeNodeImpl(1, new EmberNodeImpl('channel'), childrenOf([gain]))
				const device = new NumberedTreeNodeImpl(1, new EmberNodeImpl('device'), childrenOf([channel]))
				gain.parent = channel
				channel.parent = device
				client.tree.set(1, device)
				const directory = await client.getDirectory(channel)
				directory.response?.catch(() => null) // no reply here, so the request is cancelled on disconnect
				await client.subscribe(gain)

				await client.unsubscribe(device)
				onSocketWrite.mockClear()
				await reconnect(socket)

				expect(sentCommands()).toEqual([
					['1.1', CommandType.GetDirectory],
					['1.1.1', CommandType.Subscribe],
				])
			})
		})
	})

	describe('timeouts and resends', () => {
		// A resend that couldn't be sent rejected the request but left it waiting, to be sent and rejected again on
		// every check until it timed out
		it('drops a request whose resend cannot be sent', async () => {
			await runWithConnection(
				async (client, socket) => {
					const request = await client.getDirectory(new NumberedTreeNodeImpl(1, new EmberNodeImpl('a')))
					expect(request.sentOk).toBe(true)
					let rejection: unknown
					request.response?.catch((e: unknown) => (rejection = e))
					socket.onWrite = () => false

					await new Promise((resolve) => setTimeout(resolve, 150))

					expect((rejection as Error | undefined)?.message).toBe('Request was not sent correctly')
					expect(client['_requests'].size).toBe(0)
				},
				{ enableResends: true, resendTimeout: 50, timeout: 10000 }
			)
		})

		// A caller may read only sentOk. The response it didn't await was rejected unhandled when the request timed out,
		// which ends a Node process
		it('lets a caller ignore the response of a request that times out', async () => {
			await runWithConnection(
				async (client) => {
					const ignored = await client.getDirectory(new NumberedTreeNodeImpl(1, new EmberNodeImpl('a')))
					expect(ignored.sentOk).toBe(true)
					const awaited = await client.getDirectory(new NumberedTreeNodeImpl(2, new EmberNodeImpl('b')))

					await expect(awaited.response).rejects.toThrow('Request timed out')
					await new Promise((resolve) => setTimeout(resolve, 200))
					expect(client['_requests'].size).toBe(0)
				},
				{ timeout: 100 }
			)
		})

		// An id was four random base-24 digits: two requests waiting could have the same, and the later replaced the
		// earlier, which then never settled, not even by timing out
		it('gives each request its own id, whatever Math.random gives', async () => {
			const random = vi.spyOn(Math, 'random').mockReturnValue(0.5)
			try {
				await runWithConnection(async (client) => {
					const a = await client.getDirectory(new NumberedTreeNodeImpl(1, new EmberNodeImpl('a')))
					const b = await client.getDirectory(new NumberedTreeNodeImpl(2, new EmberNodeImpl('b')))

					expect(a.reqId).not.toBe(b.reqId)
					expect(client['_requests'].size).toBe(2)
				})
			} finally {
				random.mockRestore()
			}
		})

		// The check ran every gcd(timeout, resendTimeout) ms: every millisecond for a timeout of 2999 ms. And the interval
		// kept the process running until the client was discarded.
		it('checks no more often than every 50 ms, without keeping the process running', async () => {
			const setInterval = vi.spyOn(global, 'setInterval')
			try {
				await runWithConnection(
					async (client) => {
						expect(setInterval).toHaveBeenCalledWith(expect.any(Function), 50)
						expect(client['_timer'].hasRef()).toBe(false)
					},
					{ timeout: 2999, resendTimeout: 1000 }
				)
			} finally {
				setInterval.mockRestore()
			}
		})
	})
})
