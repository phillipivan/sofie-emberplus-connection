import {
	berDecode,
	ConnectionStatus,
	DecodeOptions,
	DecodeResult,
	EmberClient,
	EmberClientOptions,
	EmberServer,
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

		expect(decoded).toHaveProperty('value')
	})

	test('the types of the client, server, socket and codec signatures', () => {
		const options: EmberClientOptions = { timeout: 1000, getDirectoryOnParams: false }
		// Not called: it only has to compile
		const signatures = async (client: EmberClient, server: EmberServer) => {
			const sent: RequestPromise<Types.Root | Types.RootElement> = client.getDirectory(
				client.tree,
				Model.FieldFlags.Default
			)
			const request: RequestPromiseArguments<Types.Root | Types.RootElement> = await sent
			server.onInvocation = async (_fn, invocation: Types.NumberedTreeNode<Model.Invoke>) =>
				Promise.resolve({ id: invocation.contents.invocation?.id ?? -1, success: true })
			server.on('clientError', (socket: S101Socket) => socket.status === ConnectionStatus.Connected)
			const command: Model.Command = invocation()
			const tree: S101SocketEvents['emberTree'] = [berDecode(Buffer.alloc(0))]
			const codecEvent: keyof S101CodecEvents = 'keepaliveReq'
			return { request, command, tree, codecEvent }
		}
		const invocation = (): Model.Invoke => ({
			type: Model.ElementType.Command,
			number: Model.CommandType.Invoke,
		})

		expect(options.timeout).toBe(1000)
		expect(typeof signatures).toBe('function')
	})
})
