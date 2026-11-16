import { EventEmitter } from 'eventemitter3'

import { berEncode, DecodedRoot } from '../../encodings/ber/index.js'
import { at } from '../../lib/at.js'
import {
	Command,
	CommandType,
	FieldFlags,
	GetDirectory,
	GetDirectoryImpl,
	Invoke,
	isInvoke,
	Subscribe,
	SubscribeImpl,
	Unsubscribe,
	UnsubscribeImpl,
} from '../../model/Command.js'
import { Connection, ConnectionDisposition, ConnectionOperation } from '../../model/Connection.js'
import { ElementType, EmberElement } from '../../model/EmberElement.js'
import { EmberFunction } from '../../model/EmberFunction.js'
import { InvocationResult } from '../../model/InvocationResult.js'
import { Connections, Matrix } from '../../model/Matrix.js'
import { fitsItsType, isValueOfType, Parameter, ParameterImpl } from '../../model/Parameter.js'
import { NumberedTreeNodeImpl, QualifiedElementImpl } from '../../model/Tree.js'
import {
	Collection,
	CommandableElementType,
	ElementOf,
	EmberTypedValue,
	EmberValue,
	NumberedTreeNode,
	QualifiedCommand,
	QualifiedElement,
	RelativeOID,
	RootElement,
	RootType,
	TreeElement,
} from '../../types/types.js'
import { getPath, isElementOfType, isEmptyNode, isNumbered, toQualifiedCommand, updateProps } from '../Lib/util.js'
import { S101Client } from '../Socket/index.js'
import { ConnectionStatus } from './ConnectionStatus.js'
import { StreamManager } from './StreamManager.js'

export { ConnectionStatus }

export type RequestPromise<T> = Promise<RequestPromiseArguments<T>>
export interface RequestPromiseArguments<T> {
	sentOk: boolean
	reqId?: string
	cancel?: () => void
	response?: Promise<T>
}

export enum ExpectResponse {
	None = 'none',
	Any = 'any',
	HasChildren = 'has-children',
}

export interface Request {
	reqId: string
	/** What was sent: an element (a value or connection to set, or a command at the root), or a command for one */
	node: RootElement | QualifiedCommand
	// Basic validation of the response change
	nodeResponse: ExpectResponse

	/**
	 * Settles the request with what answers it: resolves it when that is of the kind the request expects (as its
	 * promise is typed), and rejects it when not
	 */
	resolve: (res: Response) => void
	reject: (err: Error) => void
	cb?: (EmberNode: TreeElement<EmberElement>) => void
	/** For a request to change a matrix connection: the target, whose connection the reply has to report */
	connectionTarget?: number
	message: Buffer
	firstSent: number
	lastSent: number
}

export interface Subscription {
	path: string | undefined // undefined implies root level
	cb: (EmberNode: TreeElement<EmberElement>) => void
}

export interface Change {
	path: string | undefined
	node: RootElement
	emptyNode?: boolean
	/** For a change to a matrix: the connections the provider reported, as it reported them */
	connections?: Connections
}

export type EmberClientEvents = {
	error: [Error]
	warn: [Error]

	connected: []
	disconnected: []
	streamUpdate: [path: string, value: EmberValue]
}

export interface EmberClientOptions {
	timeout?: number
	enableResends?: boolean
	resendTimeout?: number
	getDirectoryOnParams?: boolean
}

export class EmberClient extends EventEmitter<EmberClientEvents> {
	host: string
	port: number
	tree: Collection<NumberedTreeNode<EmberElement>> = []

	private _streamManager: StreamManager
	private _requests = new Map<string, Request>()
	private _lastInvocation = 0
	private _client: S101Client
	private _subscriptions: Array<Subscription> = []
	/** The parameters subscribed to for their stream values, by path: what a path's callbacks are called with */
	private _streamNodes = new Map<string, RootElement>()
	/**
	 * The GetDirectory and Subscribe requests that reached the provider and haven't been unsubscribed, by path
	 * ('' for the root), with the element type a request to that path is sent as. A provider keeps what a consumer
	 * subscribed to only for that connection, so after a reconnect they're sent again: see _restoreSubscriptions.
	 */
	private _sentGetDirectories = new Map<
		RelativeOID,
		{ elementType?: CommandableElementType; dirFieldMask?: FieldFlags }
	>()
	private _sentSubscribes = new Map<RelativeOID, { elementType?: CommandableElementType }>()

	private _timeout = 3000
	private _resendTimeout = 1000
	private _resends = false
	private _timer: NodeJS.Timeout
	private _getDirectoryOnParams = true

	constructor(host: string, port = 9000, options?: EmberClientOptions) {
		super()

		this.host = host
		this.port = port
		this._timeout = options?.timeout ?? 3000
		this._resendTimeout = options?.resendTimeout ?? 1000
		this._resends = options?.enableResends ?? false
		this._getDirectoryOnParams = options?.getDirectoryOnParams ?? true
		this._streamManager = new StreamManager()

		// Forward stream events from StreamManager, and call the path's callbacks as for any other change. The
		// StreamManager has put the value in the parameter by now.
		this._streamManager.on('streamUpdate', (path, value) => {
			this.emit('streamUpdate', path, value)

			const node = this._streamNodes.get(path)
			if (!node) return
			for (const subscription of this._subscriptions.filter((s) => s.path === path)) {
				subscription.cb(node)
			}
		})

		// resend timer runs at greatest common divisor of timeouts and resends
		const findGcd = (a: number, b: number) => {
			// assuming a and b are greater than 0
			while (b) {
				const t = b
				b = a % b
				a = t
			}
			return a
		}
		this._timer = setInterval(() => this._resendTimer(), findGcd(this._timeout, this._resendTimeout))

		this._client = new S101Client(this.host, this.port, true)
		this._client.on('emberTree', (tree) => {
			// Regular ember tree
			this._handleIncoming(tree)
		})
		this._client.on('emberStreamTree', (tree) => {
			// Ember Tree with Stream (the codec tells it from the others by the tags berDecode decides by)
			if (tree.rootType === RootType.Streams) this._streamManager.updateStreamValues(tree.value)
		})

		this._client.on('error', (e) => this.emit('error', e))
		this._client.on('connected', () => {
			this._restoreSubscriptions()
			this.emit('connected')
		})
		this._client.on('disconnected', () => {
			this._requests.forEach((req) => {
				req.reject(new Error('Socket was disconnected'))
				this._requests.delete(req.reqId)
			})
			this.emit('disconnected')
		})
	}

	/**
	 * Opens an s101 socket to the provider.
	 * @param host The host of the emberplus provider
	 * @param port Port of the provider
	 */
	async connect(host?: string, port?: number): Promise<void | Error> {
		if (host) this.host = host
		if (port) this.port = port

		// eslint-disable-next-line
		if (!this.host) return Promise.reject('No host specified')

		this._client.address = this.host
		this._client.port = this.port

		return this._client.connect()
	}

	/**
	 * Closes the s101 socket to the provider
	 */
	async disconnect(): Promise<void> {
		return this._client.disconnect()
	}

	/**
	 * Discards any outgoing connections, removes all requests and clears any timing loops
	 *
	 * This is destructive, using this class after discarding will cause errors.
	 */
	discard(): void {
		this.disconnect().catch(() => null) // we're not worried about errors after this
		this._client.removeAllListeners()
		// @ts-expect-error: after using this method, properties are no longer expected to always exist
		delete this._client
		this._requests.forEach((req) => {
			req.reject(new Error('Socket was disconnected'))
			this._requests.delete(req.reqId)
		})
		clearInterval(this._timer)
	}

	get connected(): boolean {
		return this._client.status === ConnectionStatus.Connected
	}

	/** Ember+ commands: */
	async getDirectory(
		node: RootElement | Collection<RootElement>,
		dirFieldMask?: FieldFlags,
		cb?: (EmberNode: TreeElement<EmberElement>) => void
	): RequestPromise<RootElement> {
		if (!node) {
			throw new Error('No node specified')
		}
		const command: GetDirectory = new GetDirectoryImpl(dirFieldMask)

		if (!('number' in node || 'path' in node)) {
			if (cb)
				this._subscriptions.push({
					path: undefined,
					cb,
				})

			const request = await this._sendRequest(
				new NumberedTreeNodeImpl(0, command),
				ExpectResponse.Any,
				isElementResponse
			)
			if (request.sentOk) this._sentGetDirectories.set('', { dirFieldMask })
			return request
		}

		// (first, so that a request that can't be sent leaves no callback behind)
		const request = toQualifiedCommand(node, command)
		if (cb)
			this._subscriptions.push({
				path: request.path,
				cb,
			})

		const sent = await this._sendRequest(request, ExpectResponse.HasChildren, isElementResponse)
		if (sent.sentOk) this._sentGetDirectories.set(request.path, { elementType: request.elementType, dirFieldMask })
		return sent
	}
	async subscribe(
		node: RootElement | Array<RootElement>,
		cb?: (EmberNode: TreeElement<EmberElement>) => void
	): RequestPromise<RootElement> {
		if (!node) {
			throw new Error('No node specified')
		}

		const command: Subscribe = new SubscribeImpl()

		if (Array.isArray(node)) {
			if (cb)
				this._subscriptions.push({
					path: undefined,
					cb,
				})

			const request = await this._sendRequest(
				new NumberedTreeNodeImpl(0, command),
				ExpectResponse.Any,
				isElementResponse
			)
			if (request.sentOk) this._sentSubscribes.set('', {})
			return request
		}

		// (first, so that a request that can't be sent leaves nothing behind)
		const request = toQualifiedCommand(node, command)

		// Check if this is a Parameter with streamIdentifier
		if (node.contents.type === ElementType.Parameter) {
			const parameter = node.contents
			if (parameter.streamIdentifier !== undefined) {
				const path = request.path
				this._streamManager.registerParameter(parameter, path)
				// like the StreamManager, keep the first one registered for a path: its value is the one updated
				if (!this._streamNodes.has(path)) this._streamNodes.set(path, node)
			}
		}

		if (cb)
			this._subscriptions.push({
				path: request.path,
				cb,
			})

		const sent = await this._sendRequest(request, ExpectResponse.None, isElementResponse)
		if (sent.sentOk) this._sentSubscribes.set(request.path, { elementType: request.elementType })
		return sent
	}
	async unsubscribe(node: NumberedTreeNode<EmberElement> | Array<RootElement>): RequestPromise<RootElement> {
		if (!node) {
			throw new Error('No node specified')
		}

		const command: Unsubscribe = new UnsubscribeImpl()

		if (Array.isArray(node)) {
			// root subscriptions are tracked with undefined path
			this._subscriptions = this._subscriptions.filter((subscription) => subscription.path !== undefined)
			this._sentGetDirectories.delete('')
			this._sentSubscribes.delete('')
			this._forgetParametersBelow('')
			return this._sendRequest(new NumberedTreeNodeImpl(0, command), ExpectResponse.Any, isElementResponse)
		}

		const path = getPath(node)

		// Remove all matching subscriptions for the path in one pass
		this._subscriptions = this._subscriptions.filter((subscription) => subscription.path !== path)
		// Unsubscribe ends both a Subscribe and the reports a GetDirectory started
		this._sentGetDirectories.delete(path)
		this._sentSubscribes.delete(path)
		if (node.contents.type === ElementType.Node) this._forgetParametersBelow(path)

		// Deregister from StreamManager if this was a Parameter with streamIdentifier
		if (!Array.isArray(node) && node.contents.type === ElementType.Parameter) {
			const parameter = node.contents
			if (parameter.streamIdentifier !== undefined) {
				this._streamManager.unregisterParameter(path)
				this._streamNodes.delete(path)
			}
		}

		return this._sendRequest(toQualifiedCommand(node, command), ExpectResponse.None, isElementResponse)
	}
	async invoke(node: ElementOf<EmberFunction>, ...args: Array<EmberTypedValue>): RequestPromise<InvocationResult> {
		if (!node) {
			throw new Error('No node specified')
		}

		// TODO - validate arguments
		const command: Invoke = {
			type: ElementType.Command,
			number: CommandType.Invoke,
			invocation: {
				id: ++this._lastInvocation,
				args,
			},
		}
		return this._sendRequest(toQualifiedCommand(node, command), ExpectResponse.Any, isInvocationResult)
	}

	/** Sending ember+ values */
	/**
	 * Asks the provider to set a parameter's value. The value is of the parameter type's form (a number for an integer,
	 * real or enum, and so on, or null); for a parameter whose type is narrowed, the types say which. A value that
	 * doesn't fit the parameter's type is refused, before anything is sent.
	 */
	async setValue<P extends Parameter>(
		node: ElementOf<P>,
		value: Exclude<P['value'], undefined>,
		awaitResponse = true
	): RequestPromise<ElementOf<Parameter>> {
		if (!node) {
			throw new Error('No node specified')
		}
		// Send only the path and the value, as the specification's examples and Lawo's libember do. The parameter type
		// only decides how the value is encoded. The tree is updated when the provider replies.
		const { parameterType } = node.contents
		const contents = new ParameterImpl(parameterType, undefined, undefined, value)
		// For a caller that doesn't check types. (Such a value was sent, coerced to the type by the encoder, or not.)
		if (!fitsItsType(contents)) {
			throw new Error(`setValue: ${String(value)} doesn't fit a parameter of the type ${parameterType}`)
		}
		const request = new QualifiedElementImpl(getPath(node), contents)

		// The reply is the parameter, of the type the tree has, or, when it isn't loaded, of the type the provider
		// reported (which the decoder guesses from the value when the provider leaves it out): not checked against P
		return this._sendRequest(
			request,
			awaitResponse ? ExpectResponse.Any : ExpectResponse.None,
			(res): res is ElementOf<Parameter> => isElementResponse(res) && isElementOfType(res, ElementType.Parameter)
		)
	}
	/**
	 * Asks the provider to connect sources to a target, in addition to the sources already connected to it.
	 *
	 * The response resolves, with the matrix, once the provider reports the connection of that target; reports on the
	 * matrix's other targets don't settle it. It rejects if the provider reports the target as locked. A report with
	 * the disposition "pending" resolves it too: the provider has queued the request, and the tree changes when it
	 * reports the connection as made.
	 */
	async matrixConnect(
		matrix: ElementOf<Matrix>,
		target: number,
		sources: Array<number>
	): RequestPromise<ElementOf<Matrix>> {
		return this._matrixMutation(matrix, target, sources, ConnectionOperation.Connect)
	}
	/** Asks the provider to disconnect sources from a target. The response settles as matrixConnect's does. */
	async matrixDisconnect(
		matrix: ElementOf<Matrix>,
		target: number,
		sources: Array<number>
	): RequestPromise<ElementOf<Matrix>> {
		return this._matrixMutation(matrix, target, sources, ConnectionOperation.Disconnect)
	}
	/**
	 * Asks the provider to connect exactly the given sources to a target, replacing those connected to it. The
	 * response settles as matrixConnect's does.
	 */
	async matrixSetConnection(
		matrix: ElementOf<Matrix>,
		target: number,
		sources: Array<number>
	): RequestPromise<ElementOf<Matrix>> {
		return this._matrixMutation(matrix, target, sources, ConnectionOperation.Absolute)
	}

	/** Getting the tree: */
	async expand(node: NumberedTreeNode<EmberElement> | Collection<RootElement>): Promise<void> {
		if (!node) {
			throw new Error('No node specified')
		}

		if (!('number' in node)) {
			await (
				await this.getDirectory(node)
			).response
			for (const root of Object.values<NumberedTreeNode<EmberElement>>(this.tree)) await this.expand(root)
			return
		}

		const emberNodes = [node]
		const canBeExpanded = (node: NumberedTreeNode<EmberElement>) => {
			if (node.contents.type === ElementType.Node) {
				return node.contents.isOnline !== false
			} else {
				return node.contents.type !== ElementType.Parameter && node.contents.type !== ElementType.Function
			}
		}

		let curEmberNode
		while ((curEmberNode = emberNodes.shift())) {
			if (curEmberNode.children) {
				emberNodes.push(
					...Object.values<NumberedTreeNode<EmberElement>>(curEmberNode.children).filter(canBeExpanded)
				)
			} else {
				const req = await this.getDirectory(curEmberNode)
				if (!req.response) continue
				const res = await req.response
				if (res.children) {
					Object.values<NumberedTreeNode<EmberElement>>(res.children).forEach(
						(c) => canBeExpanded(c) && emberNodes.push(c)
					)
				}
			}
		}
	}
	async getElementByPath(
		path: string,
		cb?: (EmberNode: TreeElement<EmberElement>) => void,
		delimiter = '.'
	): Promise<TreeElement<EmberElement> | undefined> {
		const numberedPath: Array<number> = []
		const pathArr = path.split(delimiter)

		// A path of numbers only, like 1.2.3, is a numbered path: each segment is an element's number, and nothing
		// else. In any other path each segment is an identifier, or else a description, or else a number. (Taking the
		// first child that matched any of the three let a number match an earlier sibling labelled with it.)
		const isNumber = (segment: string) => /^\d+$/.test(segment)
		const numbered = pathArr.every(isNumber)
		const getNodeInCollection = (elements: Collection<NumberedTreeNode<EmberElement>>, segment: string) => {
			const nodes = Object.values<NumberedTreeNode<EmberElement>>(elements || {})
			const byNumber = () => (isNumber(segment) ? nodes.find((r) => r.number === Number(segment)) : undefined)
			if (numbered) return byNumber()
			return (
				nodes.find((r) => 'identifier' in r.contents && r.contents.identifier === segment) ??
				nodes.find((r) => 'description' in r.contents && r.contents.description === segment) ??
				byNumber()
			)
		}
		const getNextChild = (node: TreeElement<EmberElement>, segment: string) =>
			node.children && getNodeInCollection(node.children, segment)

		const firstIdentifier = pathArr.shift()
		if (!firstIdentifier) throw new Error('Expected at least one segment in the path')

		let tree: NumberedTreeNode<EmberElement> | undefined = getNodeInCollection(this.tree, firstIdentifier)
		if (tree?.number !== undefined) numberedPath.push(tree.number)

		while (pathArr.length) {
			const i = pathArr.shift()
			if (i === undefined) break // TODO - this will break the loop if the path was `1..0`
			if (!tree) break

			let next = getNextChild(tree, i)
			if (!next) {
				// the reply: the element as the tree has it, or as the provider reported it when the tree hasn't
				const reply = await (await this.getDirectory(tree)).response
				next = reply && getNextChild(reply, i)
			}
			tree = next

			if (!tree) throw new Error(`Could not find node ${i} on given path ${numberedPath.join()}`)
			if (tree?.number !== undefined) numberedPath.push(tree.number)
		}

		if (cb && numberedPath) {
			this._subscriptions.push({
				path: numberedPath.join('.'),
				cb,
			})
		}

		if (tree?.contents.type === ElementType.Parameter && this._getDirectoryOnParams) {
			// do an additional getDirectory because Providers do not _have_ to send updates without that (should vs shall).
			// Don't wait for the reply, as some providers never answer one. A reply updates the tree and calls cb.
			const request = toQualifiedCommand(tree, new GetDirectoryImpl())
			const sent = await this._sendRequest(request, ExpectResponse.None, isElementResponse)
			if (sent.sentOk) this._sentGetDirectories.set(request.path, { elementType: request.elementType })
		}

		return tree
	}

	// This function handles the fact that the path in the Ember+ tree is not always the same as the path in requested from the provider
	getInternalNodePath(node: TreeElement<EmberElement>): string | undefined {
		if ('path' in node && typeof node.path === 'string') {
			// QualifiedElement case
			return node.path
		} else if (isNumbered(node)) {
			// NumberedTreeNode case
			const numbers: number[] = []
			let current: NumberedTreeNode<EmberElement> | undefined = node

			while (current) {
				numbers.unshift(current.number)
				if (current.parent && 'number' in current.parent) {
					current = current.parent
				} else {
					current = undefined
				}
			}

			return numbers.join('.')
		}

		return undefined
	}

	private async _matrixMutation(
		matrix: ElementOf<Matrix>,
		target: number,
		sources: Array<number>,
		operation: ConnectionOperation
	) {
		if (!matrix) {
			throw new Error('No matrix specified')
		}

		const connection: Connection = {
			operation,
			target,
			sources,
		}

		// Send only the path and the connection, as the specification's examples and Lawo's libember do. Leaving out
		// the contents leaves out the identifier they require. The tree is updated when the provider replies.
		const request = new QualifiedElementImpl<Matrix>(getPath(matrix), {
			type: ElementType.Matrix,
			connections: { [target]: connection },
		})

		return this._sendRequest(
			request,
			ExpectResponse.Any,
			(res): res is ElementOf<Matrix> => isElementResponse(res) && isElementOfType(res, ElementType.Matrix),
			target
		)
	}

	/**
	 * An Unsubscribe on a node, or on the root, also ends the subscriptions of the parameters directly below it:
	 * "all parameter subscriptions for that consumer must be removed". So what was sent for those parameters is
	 * forgotten too, not to be sent again after a reconnect, and their streams are unregistered, as their values
	 * stop arriving. (Not what is further down: that was asked for through nodes of its own.)
	 */
	private _forgetParametersBelow(path: string): void {
		const isBelow = (other: string) =>
			other !== '' && (other.includes('.') ? other.slice(0, other.lastIndexOf('.')) : '') === path

		for (const [other, { elementType }] of this._sentGetDirectories) {
			if (elementType === ElementType.Parameter && isBelow(other)) this._sentGetDirectories.delete(other)
		}
		for (const [other, { elementType }] of this._sentSubscribes) {
			if (elementType === ElementType.Parameter && isBelow(other)) this._sentSubscribes.delete(other)
		}
		for (const other of this._streamManager.getAllRegisteredPaths()) {
			if (!isBelow(other)) continue
			this._streamManager.unregisterParameter(other)
			this._streamNodes.delete(other)
		}
	}

	/**
	 * After a reconnect, asks the provider again for everything this client had subscribed to: each GetDirectory
	 * and Subscribe in _sentGetDirectories and _sentSubscribes, the root first and parents before their children,
	 * without waiting for replies (some providers never answer a GetDirectory). The replies update the loaded tree
	 * and call the subscriptions' callbacks as usual, so values that changed while disconnected come through, and
	 * nobody has to look anything up again. Nothing has been sent yet on the first connection.
	 */
	private _restoreSubscriptions(): void {
		const depth = (path: RelativeOID) => (path ? path.split('.').length : 0)
		const byDepth = ([a]: [RelativeOID, unknown], [b]: [RelativeOID, unknown]) => depth(a) - depth(b)
		const resend = (path: RelativeOID, elementType: CommandableElementType | undefined, command: Command) => {
			const request: QualifiedCommand | RootElement = elementType
				? { path, elementType, command }
				: new NumberedTreeNodeImpl(0, command) // the root
			this._sendRequest(request, ExpectResponse.None, isElementResponse).catch((e) =>
				this.emit('warn', e instanceof Error ? e : new Error(String(e)))
			)
		}

		for (const [path, { elementType, dirFieldMask }] of [...this._sentGetDirectories].sort(byDepth)) {
			resend(path, elementType, new GetDirectoryImpl(dirFieldMask))
		}
		for (const [path, { elementType }] of [...this._sentSubscribes].sort(byDepth)) {
			resend(path, elementType, new SubscribeImpl())
		}
	}

	/**
	 * @param isResponse whether what answers the request is of the kind it expects, which its promise resolves with
	 * @param connectionTarget for a request to change a matrix connection, see Request.connectionTarget
	 */
	private async _sendRequest<T extends Response>(
		node: RootElement | QualifiedCommand,
		expectResponse: ExpectResponse,
		isResponse: (res: Response) => res is T,
		connectionTarget?: number
	): RequestPromise<T> {
		const reqId = Math.random().toString(24).substr(-4)
		const requestPromise: RequestPromiseArguments<T> = {
			reqId,
			sentOk: false,
		}

		const message = berEncode([node], RootType.Elements)

		if (expectResponse !== ExpectResponse.None) {
			const p = new Promise<T>((resolve, reject) => {
				const request: Request = {
					reqId,
					node,
					nodeResponse: expectResponse,
					resolve: (res) => {
						if (isResponse(res)) resolve(res)
						else
							reject(
								new Error(`Unexpected reply to the request to ${requestPath(node)}: ${describe(res)}`)
							)
					},
					reject,
					connectionTarget,
					message,
					firstSent: Date.now(),
					lastSent: Date.now(),
				}
				this._requests.set(reqId, request)

				requestPromise.cancel = () => {
					reject(new Error('Request cancelled'))
					this._requests.delete(reqId)
				}
			})
			requestPromise.response = p
		}

		const sentOk = this._client.sendBER(message) // TODO - if sending multiple values to same path, should we do synchronous requests?

		if (!sentOk && requestPromise.cancel) {
			this._requests.get(reqId)?.reject(new Error('Request was not sent correctly'))
			this._requests.delete(reqId)
		}

		return {
			...requestPromise,
			sentOk,
		}
	}

	private _handleIncoming(incoming: DecodedRoot) {
		// update tree:
		const changes = this._applyRootToTree(incoming)

		// check for subscriptiions:
		for (const change of changes) {
			const subscriptions = this._subscriptions.filter((s) => s.path === change.path)
			if (change.node) {
				for (const subscription of subscriptions) {
					subscription.cb(change.node)
				}
			}
		}

		// check for any outstanding requests and resolve them
		// iterate over requests, check path, if Invocation check id
		// resolve requests
		for (const change of changes) {
			// (An Invoke is answered by its invocation's result, not by a report on the function.)
			const reqs = Array.from(this._requests.values()).filter(
				(s) =>
					!isInvokeRequest(s.node) &&
					((!('path' in s.node) && !change.path) || ('path' in s.node && s.node.path === change.path))
			)
			for (const req of reqs) {
				if (req.connectionTarget !== undefined) {
					// A request to change a connection is answered by a report on its target. The provider may
					// report the matrix's other targets in the meantime: those aren't the reply.
					const reported = findConnection(change.connections, req.connectionTarget)
					if (!reported) continue
					if (reported.disposition === ConnectionDisposition.Locked) {
						req.reject(new Error(`Matrix ${change.path}: target ${req.connectionTarget} is locked`))
						this._requests.delete(req.reqId)
						continue
					}
				}

				// Don't complete the response, if the call was expecting the children to be loaded
				if (req.nodeResponse === ExpectResponse.HasChildren && !change.node.children) {
					if (
						change.node.contents.type === ElementType.Parameter ||
						change.node.contents.type === ElementType.Matrix ||
						change.node.contents.type === ElementType.Function ||
						change.node.contents.type === ElementType.Template
					) {
						// leaves: their children only ever hold a command (a template has none), so don't wait for any
					} else if (change.emptyNode) {
						// update comes from an empty node, so we can't continue anyway
					} else {
						continue
					}
				}

				if (req.cb) req.cb(change.node)
				if (req.resolve) {
					req.resolve(change.node)
					this._requests.delete(req.reqId)
				}
			}
		}

		// at last, emit the errors for logging purposes
		incoming.errors.forEach((e) => this.emit('warn', e))
	}

	private _applyRootToTree(root: DecodedRoot): Array<Change> {
		const changes: Array<Change> = []

		if (root.rootType === RootType.InvocationResult) {
			const node = root.value
			this._requests.forEach((req) => {
				// the Invoke whose invocation the result is of
				if (isInvokeRequest(req.node) && req.node.command.invocation?.id === node.id) {
					req.resolve(node)
					this._requests.delete(req.reqId)
				}
			})
		} else if (root.rootType === RootType.Elements) {
			// walk tree (a stream collection holds no elements)
			for (const rootElement of Object.values<RootElement>(root.value)) {
				if ('identifier' in rootElement) {
					// rootElement is a StreamEntry
					continue
				} else if ('path' in rootElement) {
					// element is qualified
					// the top-level element's number, and the numbers below it ('' splits to [''], which is 0)
					const numbers = rootElement.path.split('.').map(Number)
					const path = numbers.slice(1)
					let tree = this.tree[at(numbers, 0)]
					const topLevel = !path.length
					let inserted = false

					if (!tree) {
						if (path.length) {
							// Assuming this means that no get directory was done on the root of the tree.
							changes.push({
								path: rootElement.path,
								node: rootElement,
								connections: reportedConnections(rootElement),
							})
							continue
						} else {
							const number = Number(rootElement.path)
							// Insert node into root
							const inserted = toTreeElement(rootElement, number)
							this.tree[number] = inserted
							changes.push({ path: undefined, node: inserted })
							continue
						}
					}

					let notLoaded = false
					for (const [i, number] of path.entries()) {
						const child: NumberedTreeNode<EmberElement> | undefined = tree.children?.[number]
						if (!child && i < path.length - 1) {
							// A node above the element isn't loaded, so there is no place for it in the tree: report it
							// as it came, as when the device itself isn't loaded
							notLoaded = true
							break
						}
						if (!child) {
							tree.children ??= {}
							tree.children[number] = toTreeElement(rootElement, number, tree)
							changes.push({
								path: rootElement.path.split('.').slice(0, -1).join('.'),
								node: tree,
							})
							inserted = true
							break
						}
						tree = child
					}

					if (inserted) continue
					if (notLoaded) {
						changes.push({
							path: rootElement.path,
							node: rootElement,
							connections: reportedConnections(rootElement),
						})
						continue
					}
					changes.push(...this._updateTree(rootElement, tree))
					// a top-level element, as in a reply to a GetDirectory on the root: also a change at the root,
					// as when it was inserted, which is what resolves that request
					if (topLevel) changes.push({ path: undefined, node: tree })
				} else {
					const cached = this.tree[rootElement.number]
					if (!rootElement.children && isEmptyNode(rootElement)) {
						// empty node on the root of the tree must mean we have done a getDir on that specific node
						changes.push({ path: rootElement.number + '', node: rootElement, emptyNode: true })
					} else if (cached && cached.contents.type === rootElement.contents.type) {
						// Merge into the cached element. A reply to a GetDirectory on the root (the usual source)
						// lists the top-level elements without their children: replacing the cached element would
						// drop everything loaded below it.
						changes.push(...this._updateTree(rootElement, cached))
						changes.push({ path: undefined, node: cached })
					} else {
						this.tree[rootElement.number] = rootElement
						changes.push({ path: undefined, node: rootElement })
					}
				}
			}
		}

		return changes
	}

	private _updateTree(update: TreeElement<EmberElement>, tree: NumberedTreeNode<EmberElement>): Array<Change> {
		const changes: Array<Change> = []

		if (update.contents.type === tree.contents.type) {
			changes.push({
				path: getPath(tree),
				node: tree,
				emptyNode: isEmptyNode(update),
				connections: reportedConnections(update),
			})
			// changes.push({ path: getPath(tree), node: tree })
			// A provider reports changes to any property, and leaves out the ones that haven't changed
			switch (tree.contents.type) {
				case ElementType.Node:
				case ElementType.Function:
				case ElementType.Template:
					updateProps<EmberElement>(tree.contents, update.contents)
					break
				case ElementType.Parameter:
					// (The update is of the same type, checked above; this check narrows it for TypeScript.)
					if (update.contents.type !== ElementType.Parameter) break
					// Not the type: when a provider leaves it out, the decoder infers one from the value (an
					// enumeration's value is an integer), so the type in an update can't be told from a guess
					{
						// Nor a value or default that doesn't fit the parameter's type: the parameter would no longer match
						// its own type. (They were stored as they came.)
						const { parameterType } = tree.contents
						const updated = update.contents // (narrowed above; a callback would lose it)
						const misfits = (['value', 'defaultValue'] as const).filter(
							(key) => updated[key] !== undefined && !isValueOfType(parameterType, updated[key])
						)
						for (const key of misfits) {
							this.emit(
								'warn',
								new Error(
									`${getPath(tree)}: a ${key} ${String(updated[key])} doesn't fit a parameter of the type ${parameterType}; not applied`
								)
							)
						}
						updateProps<Parameter>(
							tree.contents,
							updated,
							propertiesOf(updated).filter(
								(key) => key !== 'parameterType' && !(misfits as string[]).includes(key)
							)
						)
					}
					this._followStreamIdentifier(getPath(tree), tree.contents)
					break
				case ElementType.Matrix:
					if (update.contents.type !== ElementType.Matrix) break // the same type, as above
					this._updateMatrix(update.contents, tree.contents)
					break
			}
		}
		if (update.children) {
			const treePath = getPath(tree)
			if (!tree.children) {
				// The element's first children: a change, unless the contents above already made one. The callbacks
				// run once per change, and one message is one change of the element.
				if (!changes.some((change) => change.path === treePath && change.node === tree)) {
					changes.push({ path: treePath, node: tree })
				}
				tree.children = update.children
				for (const c of Object.values<NumberedTreeNode<EmberElement>>(update.children)) {
					c.parent = tree
				}
			} else {
				// Update existing children and insert missing children without recursing into undefined nodes.
				let insertedChild = false
				for (const child of Object.values<NumberedTreeNode<EmberElement>>(update.children)) {
					const i = child.number
					const oldChild = tree.children[i]
					if (oldChild) {
						changes.push(...this._updateTree(child, oldChild))
					} else {
						child.parent = tree
						tree.children[i] = child
						insertedChild = true
					}
				}
				if (insertedChild && !changes.some((change) => change.path === treePath && change.node === tree)) {
					changes.push({ path: treePath, node: tree })
				}
			}
		}

		return changes
	}

	/** A subscribed parameter's stream values are routed by its stream identifier, which a provider may change */
	private _followStreamIdentifier(path: string, parameter: Parameter) {
		const registered = this._streamManager.getStreamInfoByPath(path)
		if (!registered || registered.streamIdentifier === parameter.streamIdentifier) return
		this._streamManager.unregisterParameter(path)
		this._streamManager.registerParameter(parameter, path)
	}

	private _updateMatrix(update: Matrix, matrix: Matrix) {
		// Connections are merged below, since a report may cover only the targets that changed
		const properties = propertiesOf(update).filter((key) => key !== 'connections')
		updateProps<Matrix>(matrix, update, properties)

		// update connections
		if (update.connections) {
			const connections = (matrix.connections ??= {})
			for (const connection of Object.values<Connection>(update.connections)) {
				// (connections are kept by their target: no need to go through them all to find it)
				const cached = connections[connection.target]

				if (connection.disposition === ConnectionDisposition.Pending) {
					// The change is queued: "sources contains future state". The target's connection stays as it
					// is, marked as pending, until the provider reports the change as made. Without a connection
					// for the target there is nothing to mark, and its sources aren't known.
					if (cached) cached.disposition = connection.disposition
					continue
				}

				// Tally, modified or locked: the sources are the target's current ones. The disposition is kept
				// as the provider's last word on the target.
				if (cached) {
					cached.sources = connection.sources
					cached.disposition = connection.disposition
				} else {
					connections[connection.target] = {
						target: connection.target,
						sources: connection.sources,
						disposition: connection.disposition,
					}
				}
			}
		}
	}

	private _resendTimer() {
		if (this.connected) {
			this._requests.forEach((req) => {
				const sinceSent = Date.now() - req.lastSent
				const sinceFirstSent = Date.now() - req.firstSent
				if (this._resends && sinceSent >= this._resendTimeout) {
					const sent = this._client.sendBER(req.message)
					if (sent) {
						req.lastSent = Date.now()
					} else {
						req.reject(new Error('Request was not sent correctly'))
					}
				}
				if (sinceFirstSent >= this._timeout) {
					req.reject(new Error('Request timed out'))
					this._requests.delete(req.reqId)
				}
			})
		}
	}
}

/** The connections in an update to a matrix */
function reportedConnections(update: TreeElement<EmberElement>): Connections | undefined {
	return update.contents.type === ElementType.Matrix ? update.contents.connections : undefined
}

function findConnection(connections: Connections | undefined, target: number): Connection | undefined {
	if (!connections) return undefined
	return Object.values<Connection>(connections).find((connection) => connection.target === target)
}

/** The names of an element's contents' properties */
function propertiesOf<T extends object>(contents: T): Array<keyof T> {
	return Object.keys(contents) as Array<keyof T>
}

/**
 * A qualified element, as the provider reported it, as the numbered element the tree keeps it as: the parent of its
 * children, as the tree's elements are
 */
function toTreeElement(
	element: QualifiedElement<Exclude<EmberElement, Command>>,
	number: number,
	parent?: NumberedTreeNode<EmberElement>
): NumberedTreeNode<EmberElement> {
	const numbered = new NumberedTreeNodeImpl<EmberElement>(number, element.contents, element.children, parent)
	for (const child of Object.values<NumberedTreeNode<EmberElement>>(element.children ?? {})) child.parent = numbered
	return numbered
}

/** What answers a request: an element, as the provider reported it (or as the tree has it), or an invocation's result */
type Response = RootElement | InvocationResult

function isElementResponse(res: Response): res is RootElement {
	return 'contents' in res
}

function isInvocationResult(res: Response): res is InvocationResult {
	return !isElementResponse(res)
}

/** Whether a request is an Invoke, answered by its invocation's result */
function isInvokeRequest(node: RootElement | QualifiedCommand): node is QualifiedCommand<Invoke> {
	return 'command' in node && isInvoke(node.command)
}

function requestPath(node: RootElement | QualifiedCommand): string {
	return ('command' in node ? node.path : getPath(node)) || 'the root'
}

function describe(res: Response): string {
	return isElementResponse(res)
		? `a ${res.contents.type.toLowerCase()} at ${getPath(res) || 'the root'}`
		: `the result of invocation ${res.id}`
}
