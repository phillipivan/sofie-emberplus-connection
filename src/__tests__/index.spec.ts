import {
	berDecode,
	berEncode,
	ConnectionStatus,
	DecodedRoot,
	DecodeOptions,
	DecodeResult,
	EmberClient,
	EmberClientOptions,
	EmberServer,
	EncodableRoot,
	Model,
	RequestPromise,
	RequestPromiseArguments,
	S101Client,
	S101CodecEvents,
	S101Socket,
	S101SocketEvents,
	Types,
} from '../index.js'

// Every type a public class or function takes, returns or emits can be named from the package itself. A type that
// stops being exported fails this file's compilation, and so this test.
describe('the package exports', () => {
	test('the enums the public API takes, with their values', () => {
		expect(Model.FieldFlags.All).toBe('ALL')
		expect(Model.CommandType.Invoke).toBe(33)
		expect(Model.CommandType.Unknown).toBe(0)
		expect(ConnectionStatus.Connected).toBe(3)
	})

	test('the element type guard', () => {
		const contents: unknown = { type: Model.ElementType.Parameter }

		expect(Model.isEmberElement(contents)).toBe(true)
		expect(Model.isEmberElement({ type: 'SOMETHING ELSE' })).toBe(false)
	})

	test('the tree element guards', () => {
		const numbered: Types.RootElement = new Model.NumberedTreeNodeImpl(1, new Model.EmberNodeImpl())
		const qualified: Types.RootElement = new Model.QualifiedElementImpl('1.2', new Model.EmberNodeImpl())

		expect([Model.isNumbered(numbered), Model.isQualified(numbered)]).toEqual([true, false])
		expect([Model.isNumbered(qualified), Model.isQualified(qualified)]).toEqual([false, true])
	})

	// A numeric path: element numbers joined by '.', or '' for the root; an identifier path is not one
	test.each([
		['1.2.3', true],
		['', true],
		['0', true],
		['12.0.345', true],
		['gain', false],
		['1.gain', false],
		['1..2', false],
		['.1', false],
		['1.', false],
		['-1', false],
		['1.5e3', false],
	])('isRelativeOID(%j) is %s', (path, result) => {
		expect(Types.isRelativeOID(path)).toBe(result)
	})

	test('the RelativeOID type takes a numeric path and not an identifier path', () => {
		const path: Types.RelativeOID = '1.2.3'
		// @ts-expect-error an identifier path is not a numeric path
		const identifiers: Types.RelativeOID = 'Ruby.Sums'

		expect([path, identifiers]).toHaveLength(2)
	})

	test('the socket class S101Client is built on', () => {
		expect(new S101Client('localhost', 9000, false)).toBeInstanceOf(S101Socket)
	})

	test("berDecode's options and result", () => {
		const options: DecodeOptions = {
			skipApplicationTags: true,
			skipContextTags: true,
			substituteForRequired: true,
			skipUnexpected: true,
		}
		const decoded: DecodeResult<Types.Root> = berDecode(Buffer.from([0x60, 0x00]), options)
		const typed: DecodedRoot = berDecode(Buffer.from([0x60, 0x00]))
		const root: EncodableRoot = [[], Types.RootType.Elements]

		expect(decoded).toHaveProperty('value')
		expect(typed.rootType).toBe(Types.RootType.Elements)
		expect(berEncode(...root)).toBeInstanceOf(Buffer)
	})

	test('the types of the client, server, socket and codec signatures', () => {
		const options: EmberClientOptions = { timeout: 1000, getDirectoryOnParams: false }
		// Not called: it only has to compile
		const signatures = async (client: EmberClient, server: EmberServer) => {
			const sent: RequestPromise<Types.RootElement> = client.getDirectory(client.tree, Model.FieldFlags.Default)
			const request: RequestPromiseArguments<Types.RootElement> = await sent
			const set: RequestPromise<Types.ElementOf<Model.Parameter>> = client.setValue(
				new Model.NumberedTreeNodeImpl(1, new Model.ParameterImpl(Model.ParameterType.Integer)),
				5
			)
			server.onInvocation = async (_fn, invocation: Types.NumberedTreeNode<Model.Invoke>) =>
				Promise.resolve({ id: invocation.contents.invocation?.id ?? -1, success: true })
			server.on('clientError', (socket: S101Socket) => socket.status === ConnectionStatus.Connected)
			const command: Model.Command = invocation()
			const tree: S101SocketEvents['emberTree'] = [berDecode(Buffer.alloc(0))]
			const codecEvent: keyof S101CodecEvents = 'keepaliveReq'
			return { request, set, command, tree, codecEvent }
		}
		const invocation = (): Model.Invoke => ({
			type: Model.ElementType.Command,
			number: Model.CommandType.Invoke,
		})

		expect(options.timeout).toBe(1000)
		expect(typeof signatures).toBe('function')
	})
})
