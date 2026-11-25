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
import { EmberNodeImpl } from '../../model/EmberNode.js'
import { InvocationResult } from '../../model/InvocationResult.js'
import { Label, LabelSet } from '../../model/Label.js'
import { Connections, connectionsOf, hasSignal, Matrix } from '../../model/Matrix.js'
import { fitsItsType, isValueOfType, Parameter, ParameterImpl } from '../../model/Parameter.js'
import { Children, NumberedTreeNodeImpl, QualifiedElementImpl } from '../../model/Tree.js'
import {
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
import {
	childPath,
	getPath,
	isElementOfType,
	isEmptyNode,
	isNumbered,
	parentPath,
	propertiesOf,
	sameValue,
	toQualifiedCommand,
	updateProps,
} from '../Lib/util.js'
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

/** What is called with an element when the provider reports it */
type SubscriptionCallback = (EmberNode: TreeElement<EmberElement>) => void

export interface Change {
	path: string | undefined
	node: RootElement
	emptyNode?: boolean
	/** For a change to a matrix: the connections the provider reported, as it reported them */
	connections?: Connections
}

/** What happened to an element a message reported: see TreeChange */
export enum TreeChangeKind {
	/** An element the tree didn't have was put into it. Each element below it is a change of its own. */
	Added = 'ADDED',
	/** Properties of an element the tree has changed */
	Updated = 'UPDATED',
	/** An element was reported below one the tree hasn't loaded, so it has no place in the tree */
	OutsideTree = 'OUTSIDE_TREE',
}

/** The name of a property of an element's contents, of any kind of element */
export type ContentsProperty =
	Exclude<EmberElement, Command> extends infer E ? (E extends unknown ? keyof E : never) : never

/**
 * What a label parameter is the label of: a target or source of a matrix the tree has. A label is a parameter directly
 * below a label node: `<basePath>.1` (targets) or `<basePath>.2` (sources) of one of the matrix's label sets (its
 * `labels`), the parameter numbered by its signal, or a signal's `labelsLocation`.
 */
export interface SignalLabel {
	/** The matrix, as the tree has it */
	matrix: NumberedTreeNode<Matrix>
	matrixPath: RelativeOID
	kind: 'target' | 'source'
	signal: number
	/** The label set the label is of; undefined for a label below the signal's `labelsLocation` */
	set?: Label
	/** The label's text: the parameter's value, when it is a string */
	text?: string
}

/** An element the tree didn't have, put into it */
export interface TreeChangeAdded {
	kind: TreeChangeKind.Added
	path: RelativeOID
	/** The element, as the tree has it */
	element: NumberedTreeNode<EmberElement>
	/** For a matrix's label: whose */
	label?: SignalLabel
}

/**
 * A change to one of a matrix's connections: its sources, or its disposition (pending while a change is queued, then
 * modified, locked or tally). No sources and none listed are the same, as are no disposition and tally.
 */
export interface ConnectionChange {
	target: number
	/** The connection as it was: undefined when the client had none for the target */
	previous: { sources?: Array<number>; disposition?: ConnectionDisposition } | undefined
	/** The connection as the matrix has it now */
	connection: Connection
}

/** An element the tree has, with properties of its contents, or a matrix's connections, changed */
export interface TreeChangeUpdated {
	kind: TreeChangeKind.Updated
	path: RelativeOID
	/** The element, as the tree has it: with the new values */
	element: NumberedTreeNode<EmberElement>
	/** The properties that changed, a matrix's connections apart (see `connections`): none when only they did */
	changed: Array<ContentsProperty>
	/** The value each changed property had before (undefined: it had none) */
	previous: { [K in ContentsProperty]?: unknown }
	/** For a matrix whose connections changed: each connection that did, in the order the report gave them */
	connections?: Array<ConnectionChange>
	/** For a matrix's label: whose */
	label?: SignalLabel
}

/** An element reported below one the tree hasn't loaded: not in the tree, so given as the provider reported it */
export interface TreeChangeOutsideTree {
	kind: TreeChangeKind.OutsideTree
	path: RelativeOID
	element: QualifiedElement<Exclude<EmberElement, Command>>
	/** For a matrix's label: whose */
	label?: SignalLabel
}

/**
 * A change one message from the provider made to the client's tree, or an element it reported that has no place in
 * the tree. A property sent again with the value it had is no change: an element is Updated only when one of its
 * properties got a different value. An element merely passed through, as the nodes above the one a nested report is
 * about, isn't a change.
 */
export type TreeChange = TreeChangeAdded | TreeChangeUpdated | TreeChangeOutsideTree

export type EmberClientEvents = {
	error: [Error]
	warn: [Error]

	connected: []
	disconnected: []
	streamUpdate: [path: string, value: EmberValue]
	/**
	 * The changes one message from the provider made, in the order it gave them, once the tree has them. Not emitted
	 * for a message that changed nothing. Stream values come with streamUpdate instead.
	 */
	change: [changes: Array<TreeChange>]
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
	/** The tree's top level, the root's children, by number */
	tree: Children = new Map()

	private _streamManager: StreamManager
	private _requests = new Map<string, Request>()
	private _lastInvocation = 0
	private _client: S101Client
	/** The callbacks for each path (undefined for the root), in the order they were given, a callback given twice twice */
	private _subscriptions = new Map<string | undefined, Array<SubscriptionCallback>>()
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
	/**
	 * The latest GetDirectory on the root, answered or on its way: what getElementByPath waits for when the top level
	 * doesn't have a path's first element. Undefined until one is sent, and again when one fails.
	 */
	private _rootDirectory: Promise<void> | undefined
	/**
	 * The matrices in the tree, from when the change event first looked for a label: kept up to date as elements are
	 * put into the tree. (One no longer in the tree is dropped when the label nodes are next found.)
	 */
	private _matrices: Set<NumberedTreeNode<Matrix>> | undefined
	/** The label nodes of those matrices, by path, until a matrix is put into the tree or its labels or signals change */
	private _labelNodeIndex: Map<RelativeOID, LabelNode> | undefined

	private _timeout = 3000
	private _resendTimeout = 1000
	private _resends = false
	private _timer: NodeJS.Timeout
	/** The id of the next request: an id only tells requests apart in `_requests`, as nothing on the wire has one */
	private _nextReqId = 0
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
			for (const cb of this._callbacksAt(path)) cb(node)
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
		// At least 50 ms apart: timeouts such as 2999 and 1000 ms have a gcd of 1, which made the check run every
		// millisecond. And it doesn't keep the process running, which a socket does while there is a connection.
		this._timer = setInterval(() => this._resendTimer(), Math.max(50, findGcd(this._timeout, this._resendTimeout)))
		this._timer.unref()

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
			this._rejectAllRequests()
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

		if (!this.host) throw new Error('No host specified')

		this._client.address = this.host
		this._client.port = this.port

		return this._client.connect()
	}

	/**
	 * Closes the s101 socket to the provider
	 */
	async disconnect(): Promise<void> {
		// The socket's disconnect() sets its status first, so the close emits no 'disconnected' to reject the requests
		// waiting; and timeouts are checked only while connected, so they would wait for good
		this._rejectAllRequests()
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
		this._rejectAllRequests()
		clearInterval(this._timer)
	}

	/** Rejects every request waiting for a reply, there being no connection for one to come on */
	private _rejectAllRequests(): void {
		for (const req of this._requests.values()) req.reject(new Error('Socket was disconnected'))
		this._requests.clear()
	}

	get connected(): boolean {
		return this._client.status === ConnectionStatus.Connected
	}

	/** Ember+ commands: */
	async getDirectory(
		node: RootElement | Children,
		dirFieldMask?: FieldFlags,
		cb?: (EmberNode: TreeElement<EmberElement>) => void
	): RequestPromise<RootElement> {
		if (!node) {
			throw new Error('No node specified')
		}
		const command: GetDirectory = new GetDirectoryImpl(dirFieldMask)

		if (!('number' in node || 'path' in node)) {
			if (cb) this._addSubscription(undefined, cb)

			const sending = this._sendRequest(
				new NumberedTreeNodeImpl(0, command),
				ExpectResponse.Any,
				isElementResponse
			)
			// Kept before anything is awaited, so that a lookup made meanwhile waits for this one instead of sending its
			// own. One that fails isn't kept, so the next lookup sends another (and its failure is handled here).
			const loaded = sending.then(async (request) => request.response).then(() => undefined)
			this._rootDirectory = loaded
			loaded.catch(() => {
				if (this._rootDirectory === loaded) this._rootDirectory = undefined
			})
			const request = await sending
			if (request.sentOk) this._sentGetDirectories.set('', { dirFieldMask })
			return request
		}

		// (first, so that a request that can't be sent leaves no callback behind)
		const request = toQualifiedCommand(node, command)
		if (cb) this._addSubscription(request.path, cb)

		const sent = await this._sendRequest(request, ExpectResponse.HasChildren, isElementResponse)
		if (sent.sentOk) this._sentGetDirectories.set(request.path, { elementType: request.elementType, dirFieldMask })
		return sent
	}
	async subscribe(
		node: RootElement | Children,
		cb?: (EmberNode: TreeElement<EmberElement>) => void
	): RequestPromise<RootElement> {
		if (!node) {
			throw new Error('No node specified')
		}

		const command: Subscribe = new SubscribeImpl()

		if (node instanceof Map) {
			if (cb) this._addSubscription(undefined, cb)

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

		if (cb) this._addSubscription(request.path, cb)

		const sent = await this._sendRequest(request, ExpectResponse.None, isElementResponse)
		if (sent.sentOk) this._sentSubscribes.set(request.path, { elementType: request.elementType })
		return sent
	}
	async unsubscribe(node: RootElement | Children): RequestPromise<RootElement> {
		if (!node) {
			throw new Error('No node specified')
		}

		const command: Unsubscribe = new UnsubscribeImpl()

		if (node instanceof Map) {
			// root subscriptions are tracked with undefined path
			this._subscriptions.delete(undefined)
			this._sentGetDirectories.delete('')
			this._sentSubscribes.delete('')
			this._forgetParametersBelow('')
			return this._sendRequest(new NumberedTreeNodeImpl(0, command), ExpectResponse.Any, isElementResponse)
		}

		const path = getPath(node)

		// Remove all matching subscriptions for the path in one pass
		this._subscriptions.delete(path)
		// Unsubscribe ends both a Subscribe and the reports a GetDirectory started
		this._sentGetDirectories.delete(path)
		this._sentSubscribes.delete(path)
		if (node.contents.type === ElementType.Node) this._forgetParametersBelow(path)

		// Deregister from StreamManager if this was a Parameter with streamIdentifier
		if (!(node instanceof Map) && node.contents.type === ElementType.Parameter) {
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
	async expand(node: RootElement | Children): Promise<void> {
		if (!node) {
			throw new Error('No node specified')
		}

		if (node instanceof Map) {
			await (
				await this.getDirectory(node)
			).response
			for (const root of this.tree.values()) await this.expand(root)
			return
		}

		const emberNodes: Array<RootElement> = [node]
		const canBeExpanded = (node: RootElement) => {
			if (node.contents.type === ElementType.Node) {
				return node.contents.isOnline !== false
			} else {
				return node.contents.type !== ElementType.Parameter && node.contents.type !== ElementType.Function
			}
		}

		let curEmberNode
		while ((curEmberNode = emberNodes.shift())) {
			if (curEmberNode.children) {
				emberNodes.push(...[...curEmberNode.children.values()].filter(canBeExpanded))
			} else {
				const req = await this.getDirectory(curEmberNode)
				if (!req.response) continue
				const res = await req.response
				if (res.children) {
					for (const c of res.children.values()) if (canBeExpanded(c)) emberNodes.push(c)
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
		const getNodeInCollection = (elements: Children, segment: string) => {
			const nodes = [...elements.values()]
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
		if (!tree) {
			// The top level comes from a GetDirectory on the root: send one, unless one has been (answered or on its way),
			// and look again when it is answered. (Nothing was found until the caller had sent one.)
			if (!this._rootDirectory) await this.getDirectory(this.tree)
			await this._rootDirectory
			tree = getNodeInCollection(this.tree, firstIdentifier)
		}
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
			this._addSubscription(numberedPath.join('.'), cb)
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

	/** Matrices: */
	/**
	 * Fetches a matrix's labels, given by its `labels` (the older of the specification's two ways of labelling signals):
	 * every label set, in the order the matrix lists them (the only order the specification gives: take the first by
	 * default), each with its description, by which a user chooses one. A GetDirectory on each set's targets and sources
	 * nodes (`<basePath>.1`, `<basePath>.2`), which also asks the provider to report changes to them, and is sent again
	 * after a reconnect. The labels are as reported (any padding kept); one that isn't a string (a null value) is left
	 * out. Rejects when a request fails, as one that times out.
	 *
	 * The matrix's contents have to be loaded: a provider may report them only when listing the matrix's parent, and not
	 * in reply to a GetDirectory on the matrix. With no label sets, it gives none, and sends nothing.
	 */
	async getMatrixLabels(matrix: ElementOf<Matrix>): Promise<Array<LabelSet>> {
		const sets: Array<LabelSet> = []
		for (const { basePath, description } of matrix.contents.labels ?? []) {
			const [targets, sources] = await Promise.all([
				this._labelsAt(childPath(basePath, 1)),
				this._labelsAt(childPath(basePath, 2)),
			])
			sets.push({ basePath, description, targets, sources })
		}
		return sets
	}
	/**
	 * The path of the node holding a matrix's signal and connection parameters (its `parametersLocation`): the path it
	 * gives, or, for an inline number, the matrix's own path and that number. (An inline node isn't listed by a
	 * GetDirectory, so it is asked for by its path.) Undefined when the matrix has no parametersLocation.
	 */
	matrixParametersPath(matrix: ElementOf<Matrix>): RelativeOID | undefined {
		const location = matrix.contents.parametersLocation
		if (location === undefined) return undefined
		return typeof location === 'number' ? childPath(getPath(matrix), location) : location
	}
	/** The path of the node holding a target's parameters: `<parametersLocation>.1.<target>` */
	matrixTargetParametersPath(matrix: ElementOf<Matrix>, target: number): RelativeOID | undefined {
		const base = this.matrixParametersPath(matrix)
		return base === undefined ? undefined : childPath(childPath(base, 1), target)
	}
	/** The path of the node holding a source's parameters: `<parametersLocation>.2.<source>` */
	matrixSourceParametersPath(matrix: ElementOf<Matrix>, source: number): RelativeOID | undefined {
		const base = this.matrixParametersPath(matrix)
		return base === undefined ? undefined : childPath(childPath(base, 2), source)
	}
	/** The path of the node holding a connection's parameters: `<parametersLocation>.3.<target>.<source>` */
	matrixConnectionParametersPath(matrix: ElementOf<Matrix>, target: number, source: number): RelativeOID | undefined {
		const base = this.matrixParametersPath(matrix)
		return base === undefined ? undefined : childPath(childPath(childPath(base, 3), target), source)
	}
	/**
	 * The path of a connection's gain parameter (an n-to-n matrix's `gainParameterNumber`, in the connection's
	 * parameters node). Undefined when the matrix has no parametersLocation or no gainParameterNumber.
	 */
	matrixConnectionGainPath(matrix: ElementOf<Matrix>, target: number, source: number): RelativeOID | undefined {
		const connection = this.matrixConnectionParametersPath(matrix, target, source)
		const gain = matrix.contents.gainParameterNumber
		return connection === undefined || gain === undefined ? undefined : childPath(connection, gain)
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

	/** The element the tree has at a numeric path, if it has one */
	private _loadedElement(path: RelativeOID): NumberedTreeNode<EmberElement> | undefined {
		if (path === '') return undefined
		const [top, ...below] = path.split('.').map(Number)
		let element = top === undefined ? undefined : this.tree.get(top)
		for (const number of below) element = element?.children?.get(number)
		return element
	}

	/** The labels in a label set's targets or sources node: its string parameters' values, by number */
	private async _labelsAt(path: RelativeOID): Promise<{ [signal: number]: string }> {
		const request = await this.getDirectory(new QualifiedElementImpl(path, new EmberNodeImpl()))
		if (!request.response) throw new Error(`The request for the labels at ${path} was not sent`)
		const reply = await request.response
		const labels: { [signal: number]: string } = {}
		for (const label of reply.children?.values() ?? []) {
			if (label.contents.type === ElementType.Parameter && typeof label.contents.value === 'string') {
				labels[label.number] = label.contents.value
			}
		}
		return labels
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
		// A target or source the matrix doesn't have is refused here: a provider ignores the request (as the XACI does),
		// and it would only time out. Checked against the tree's copy of the matrix when there is one; let through
		// when the matrix gives no targets or sources to tell by.
		const path = getPath(matrix)
		const known = (this._loadedElement(path) ?? matrix).contents
		if (known.type === ElementType.Matrix) {
			if (hasSignal(known, 'target', target) === false) {
				throw new Error(`Matrix ${path}: target ${target} is not one of its targets`)
			}
			const unknown = sources.filter((source) => hasSignal(known, 'source', source) === false)
			if (unknown.length) {
				throw new Error(
					`Matrix ${path}: ${unknown.length > 1 ? 'sources' : 'source'} ${unknown.join(', ')} not among its sources`
				)
			}
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
			connections: connectionsOf([connection]),
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
		// Counted, not random: four random base-24 digits could be those of a request waiting, which this one replaced,
		// and which then never settled
		const reqId = String(this._nextReqId++)
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
			// A caller may read only sentOk: a response it doesn't await isn't to reject unhandled, which ends a Node
			// process. A caller awaiting it still gets the rejection.
			p.catch(() => undefined)
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
		// update tree (noting its changes for the change event only when something listens):
		const treeChanges: Array<TreeChange> | undefined = this.listenerCount('change') ? [] : undefined
		const changes = this._applyRootToTree(incoming, treeChanges)

		// check for subscriptiions:
		for (const change of changes) {
			if (change.node) {
				for (const cb of this._callbacksAt(change.path)) cb(change.node)
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

		if (treeChanges?.length) {
			this._addLabels(treeChanges)
			this.emit('change', treeChanges)
		}
	}

	/** Puts a message's elements into the tree. Notes each change for the change event in `notes`, when given. */
	private _applyRootToTree(root: DecodedRoot, notes?: Array<TreeChange>): Array<Change> {
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
			for (const rootElement of root.value) {
				if ('path' in rootElement) {
					// element is qualified
					// the top-level element's number, and the numbers below it ('' splits to [''], which is 0)
					const numbers = rootElement.path.split('.').map(Number)
					const path = numbers.slice(1)
					let tree = this.tree.get(at(numbers, 0))
					const topLevel = !path.length
					let inserted = false

					if (!tree) {
						if (path.length) {
							// Assuming this means that no get directory was done on the root of the tree.
							changes.push(reportedChange(rootElement))
							notes?.push(outsideTree(rootElement))
							continue
						} else {
							const number = Number(rootElement.path)
							// Insert node into root
							const inserted = toTreeElement(rootElement, number)
							this.tree.set(number, inserted)
							changes.push({ path: undefined, node: inserted }, insertedChange(rootElement, inserted))
							this._inserted(inserted, notes)
							continue
						}
					}

					let notLoaded = false
					for (const [i, number] of path.entries()) {
						const child: NumberedTreeNode<EmberElement> | undefined = tree.children?.get(number)
						if (!child && i < path.length - 1) {
							// A node above the element isn't loaded, so there is no place for it in the tree: report it
							// as it came, as when the device itself isn't loaded
							notLoaded = true
							break
						}
						if (!child) {
							tree.children ??= new Map()
							const element = toTreeElement(rootElement, number, tree)
							tree.children.set(number, element)
							changes.push(
								{ path: rootElement.path.split('.').slice(0, -1).join('.'), node: tree },
								insertedChange(rootElement, element)
							)
							this._inserted(element, notes)
							inserted = true
							break
						}
						tree = child
					}

					if (inserted) continue
					if (notLoaded) {
						changes.push(reportedChange(rootElement))
						notes?.push(outsideTree(rootElement))
						continue
					}
					changes.push(...this._updateTree(rootElement, tree, notes))
					// a top-level element, as in a reply to a GetDirectory on the root: also a change at the root,
					// as when it was inserted, which is what resolves that request
					if (topLevel) changes.push({ path: undefined, node: tree })
				} else {
					const cached = this.tree.get(rootElement.number)
					if (!rootElement.children && isEmptyNode(rootElement)) {
						// empty node on the root of the tree must mean we have done a getDir on that specific node
						changes.push({ path: rootElement.number + '', node: rootElement, emptyNode: true })
					} else if (cached && cached.contents.type === rootElement.contents.type) {
						// Merge into the cached element. A reply to a GetDirectory on the root (the usual source)
						// lists the top-level elements without their children: replacing the cached element would
						// drop everything loaded below it.
						changes.push(...this._updateTree(rootElement, cached, notes))
						changes.push({ path: undefined, node: cached })
					} else {
						// (an element of another type replaces the cached one, and whatever matrices were below it)
						if (cached) this._labelNodeIndex = undefined
						this.tree.set(rootElement.number, rootElement)
						changes.push({ path: undefined, node: rootElement })
						this._inserted(rootElement, notes)
					}
				}
			}
		}

		return changes
	}

	/** Merges an update into an element of the tree. Notes each change for the change event in `notes`, when given. */
	private _updateTree(
		update: TreeElement<EmberElement>,
		tree: NumberedTreeNode<EmberElement>,
		notes?: Array<TreeChange>
	): Array<Change> {
		const changes: Array<Change> = []

		if (update.contents.type === tree.contents.type) {
			changes.push({
				path: getPath(tree),
				node: tree,
				emptyNode: isEmptyNode(update),
				connections: reportedConnections(update),
			})
			// A provider reports changes to any property, and leaves out the ones that haven't changed
			let previous: TreeChangeUpdated['previous'] = {}
			let connections: Array<ConnectionChange> = []
			switch (tree.contents.type) {
				case ElementType.Node:
				case ElementType.Function:
				case ElementType.Template:
					previous = updateProps<EmberElement>(tree.contents, update.contents)
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
						previous = updateProps<Parameter>(
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
					;({ previous, connections } = this._updateMatrix(update.contents, tree.contents))
					break
			}
			const changed = propertiesOf(previous)
			if (notes && (changed.length || connections.length)) {
				notes.push({
					kind: TreeChangeKind.Updated,
					path: getPath(tree),
					element: tree,
					changed,
					previous,
					...(connections.length ? { connections } : {}),
				})
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
				for (const c of update.children.values()) {
					c.parent = tree
					this._inserted(c, notes)
				}
			} else {
				// Update existing children and insert missing children without recursing into undefined nodes.
				let insertedChild = false
				for (const child of update.children.values()) {
					const i = child.number
					const oldChild = tree.children.get(i)
					if (oldChild) {
						changes.push(...this._updateTree(child, oldChild, notes))
					} else {
						child.parent = tree
						tree.children.set(i, child)
						this._inserted(child, notes)
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

	/**
	 * Merges a matrix update into the matrix the tree has, returning the properties changed (as updateProps), and the
	 * connections that changed
	 */
	private _updateMatrix(
		update: Matrix,
		matrix: Matrix
	): { previous: Partial<Matrix>; connections: Array<ConnectionChange> } {
		// Connections are merged below, since a report may cover only the targets that changed. The targets and sources
		// are replaced, contents and all, by a report that has them: they are the matrix's whole collection.
		const properties = propertiesOf(update).filter((key) => key !== 'connections')
		const previous = updateProps<Matrix>(matrix, update, properties)
		if ('labels' in previous || 'targets' in previous || 'sources' in previous) this._labelNodeIndex = undefined
		const changes: Array<ConnectionChange> = []

		// update connections
		if (update.connections) {
			const connections = (matrix.connections ??= new Map<number, Connection>())
			for (const connection of update.connections.values()) {
				// (connections are kept by their target: no need to go through them all to find it)
				const cached = connections.get(connection.target)
				const sameDisposition = cached && sameDispositions(cached.disposition, connection.disposition)

				if (connection.disposition === ConnectionDisposition.Pending) {
					// The change is queued: "sources contains future state". The target's connection stays as it
					// is, marked as pending, until the provider reports the change as made. Without a connection
					// for the target there is nothing to mark, and its sources aren't known.
					if (cached && !sameDisposition) {
						changes.push(connectionChange(cached))
						cached.disposition = connection.disposition
					}
					continue
				}

				// Tally, modified or locked: the sources are the target's current ones. The disposition is kept
				// as the provider's last word on the target. Sources and a disposition the same as the ones it has
				// are kept as they are.
				if (cached) {
					const sameSources = sameValue(cached.sources ?? [], connection.sources ?? [])
					if (sameSources && sameDisposition) continue
					changes.push(connectionChange(cached))
					if (!sameSources) cached.sources = connection.sources
					if (!sameDisposition) cached.disposition = connection.disposition
				} else {
					const added: Connection = {
						target: connection.target,
						sources: connection.sources,
						disposition: connection.disposition,
					}
					connections.set(connection.target, added)
					changes.push({ target: connection.target, previous: undefined, connection: added })
				}
			}
		}
		return { previous, connections: changes }
	}

	/** An element put into the tree: noted for the change event, when given notes, and any matrices in it kept */
	private _inserted(element: NumberedTreeNode<EmberElement>, notes: Array<TreeChange> | undefined): void {
		if (notes) noteAdded(element, notes)
		if (this._matrices && collectMatrices(element, this._matrices)) this._labelNodeIndex = undefined
	}

	/** Says, on each change to a parameter that is a matrix's label, whose label it is */
	private _addLabels(changes: Array<TreeChange>): void {
		let labelNodes: Map<RelativeOID, LabelNode> | undefined
		for (const change of changes) {
			const { contents } = change.element
			if (contents.type !== ElementType.Parameter) continue
			labelNodes ??= this._labelNodes()
			const node = labelNodes.get(parentPath(change.path))
			if (!node) continue
			change.label = {
				matrix: node.matrix,
				matrixPath: getPath(node.matrix),
				kind: node.kind,
				// a label set's label is numbered by its signal
				signal: node.signal ?? Number(change.path.slice(change.path.lastIndexOf('.') + 1)),
				...(node.set ? { set: node.set } : {}),
				...(typeof contents.value === 'string' ? { text: contents.value } : {}),
			}
		}
	}

	/** The label nodes of the tree's matrices, by path: found again only after they may have changed */
	private _labelNodes(): Map<RelativeOID, LabelNode> {
		if (!this._matrices) {
			this._matrices = new Set()
			for (const top of this.tree.values()) collectMatrices(top, this._matrices)
		}
		if (this._labelNodeIndex) return this._labelNodeIndex

		const index = new Map<RelativeOID, LabelNode>()
		for (const matrix of this._matrices) {
			if (!this._isInTree(matrix)) {
				this._matrices.delete(matrix)
				continue
			}
			const { labels, targets, sources } = matrix.contents
			for (const set of labels ?? []) {
				index.set(childPath(set.basePath, 1), { matrix, kind: 'target', set })
				index.set(childPath(set.basePath, 2), { matrix, kind: 'source', set })
			}
			for (const [kind, signals] of [
				['target', targets],
				['source', sources],
			] as const) {
				for (const [signal, { labelsLocation }] of signals ?? []) {
					if (labelsLocation !== undefined) index.set(labelsLocation, { matrix, kind, signal })
				}
			}
		}
		this._labelNodeIndex = index
		return index
	}

	/** Whether an element of the tree is still in it: an element of another type may have replaced its top level */
	private _isInTree(element: NumberedTreeNode<EmberElement>): boolean {
		let top: RootElement = element
		while (top.parent) top = top.parent
		return isNumbered(top) && this.tree.get(top.number) === top
	}

	private _addSubscription(path: string | undefined, cb: SubscriptionCallback): void {
		const callbacks = this._subscriptions.get(path)
		if (callbacks) callbacks.push(cb)
		else this._subscriptions.set(path, [cb])
	}

	/** The callbacks for a path, as they are now: one given while they are called waits for the next report */
	private _callbacksAt(path: string | undefined): Array<SubscriptionCallback> {
		return [...(this._subscriptions.get(path) ?? [])]
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
						this._requests.delete(req.reqId)
						return
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
	return connections?.get(target)
}

/** Whether two dispositions are the same: none is tally, the default */
function sameDispositions(a: ConnectionDisposition | undefined, b: ConnectionDisposition | undefined): boolean {
	return (a ?? ConnectionDisposition.Tally) === (b ?? ConnectionDisposition.Tally)
}

/** A connection's change, before it is made: what it is now, as the previous state, and the connection itself */
function connectionChange(cached: Connection): ConnectionChange {
	return {
		target: cached.target,
		previous: { sources: cached.sources, disposition: cached.disposition },
		connection: cached,
	}
}

/** A matrix's label node: the node whose parameters are labels, of a label set's targets or sources, or of a signal */
interface LabelNode {
	matrix: NumberedTreeNode<Matrix>
	kind: 'target' | 'source'
	/** For a label set's node: the set (each label numbered by its signal) */
	set?: Label
	/** For a signal's labelsLocation: the signal */
	signal?: number
}

/** Adds the matrices in an element, itself included, to a set: whether there were any */
function collectMatrices(element: NumberedTreeNode<EmberElement>, into: Set<NumberedTreeNode<Matrix>>): boolean {
	let found = false
	if (isElementOfType(element, ElementType.Matrix)) {
		into.add(element)
		found = true
	}
	for (const child of element.children?.values() ?? []) found = collectMatrices(child, into) || found
	return found
}

/** Notes an element put into the tree, and each element below it, as added */
function noteAdded(element: NumberedTreeNode<EmberElement>, notes: Array<TreeChange>): void {
	notes.push({ kind: TreeChangeKind.Added, path: getPath(element), element })
	for (const child of element.children?.values() ?? []) noteAdded(child, notes)
}

/** The change event's note of an element reported below one the tree hasn't loaded */
function outsideTree(reported: QualifiedElement<Exclude<EmberElement, Command>>): TreeChangeOutsideTree {
	return { kind: TreeChangeKind.OutsideTree, path: reported.path, element: reported }
}

/**
 * The change an element the tree has no place for (its parent, or its device, isn't loaded) makes: the element as the
 * provider reported it, at its path. An empty one is the answer to a GetDirectory on a node without children, which
 * "must report itself without any properties set" (_Glow › Commands › GetDirectory_). (It wasn't marked as one, so that
 * answer was waited past, for children, until the request timed out.)
 */
function reportedChange(reported: QualifiedElement<Exclude<EmberElement, Command>>): Change {
	return {
		path: reported.path,
		node: reported,
		emptyNode: isEmptyNode(reported),
		connections: reportedConnections(reported),
	}
}

/**
 * The change an element put into the tree makes at its own path, as one already there makes when it is updated: it
 * answers a request about the element, and calls the callbacks for its path. (Only the parent's change was made, so a
 * request about an element the tree didn't have yet, under one it had, was never answered.)
 */
function insertedChange(
	reported: QualifiedElement<Exclude<EmberElement, Command>>,
	inserted: NumberedTreeNode<EmberElement>
): Change {
	return {
		path: reported.path,
		node: inserted,
		emptyNode: isEmptyNode(reported),
		connections: reportedConnections(reported),
	}
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
	for (const child of element.children?.values() ?? []) child.parent = numbered
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
