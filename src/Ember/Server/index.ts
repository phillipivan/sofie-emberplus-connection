import { EventEmitter } from 'eventemitter3'

import { DecodeResult } from '../../encodings/ber/decoder/DecodeResult.js'
import { berEncode } from '../../encodings/ber/index.js'
import { Command, CommandType, FieldFlags, Invoke, isGetDirectory } from '../../model/Command.js'
import { Connection, ConnectionDisposition, ConnectionImpl, ConnectionOperation } from '../../model/Connection.js'
import {
	Connections,
	connectionsOf,
	ElementType,
	EmberElement,
	EmberFunction,
	EmberNodeImpl,
	hasSignal,
	InvocationResult,
	isConnections,
	Matrix,
	MatrixAddressingMode,
	MatrixImpl,
	MatrixType,
	NumberedTreeNodeImpl,
	Parameter,
	ParameterAccess,
} from '../../model/index.js'
import { InvocationResultImpl } from '../../model/InvocationResult.js'
import { Children } from '../../model/Tree.js'
import {
	EmberValue,
	NumberedTreeNode,
	QualifiedElement,
	RootElement,
	RootType,
	TreeElement,
} from '../../types/types.js'
import { getPath, isElementOfType, isInvokeElement, parentPath, toQualifiedEmberNode } from '../Lib/util.js'
import { S101Server, S101ServerOptions } from '../Socket/S101Server.js'
import S101Socket from '../Socket/S101Socket.js'

/** Limits on what a consumer may cost the provider (see S101ServerOptions) */
export type EmberServerOptions = S101ServerOptions

export type EmberServerEvents = {
	/** A handler failed: with the consumer whose request it was handling */
	error: [error: Error, client?: S101Socket]
	clientError: [client: S101Socket, error: Error]
	/**
	 * Something not done, and why: a connection request or change naming a target or source the matrix doesn't have, a
	 * consumer's connection request on a locked target, a consumer's setValue on a parameter that isn't writeable, or a
	 * consumer's connection refused, as many being connected as maxClients allows. With the consumer, when it was
	 * that consumer's request.
	 */
	warn: [error: Error, client?: S101Socket]
}

/** A consumer's connection request being handled: the targets it named that no report to it has covered yet */
interface PendingMatrixReply {
	path: string
	client: S101Socket
	targets: Set<number>
}

/** A consumer's setValue being handled; answered once an update() of the parameter has been sent to it */
interface PendingValueReply {
	path: string
	client: S101Socket
	answered: boolean
}

export class EmberServer extends EventEmitter<EmberServerEvents> {
	address: string | undefined
	port: number
	tree: Children = new Map()

	/**
	 * Answers a consumer's Invoke of a function. Every handler is also given the consumer that asked (its
	 * `remoteAddress` and `remotePort` say where from), for logging, permissions by consumer, or deciding by source.
	 */
	onInvocation?: (
		emberFunction: NumberedTreeNode<EmberFunction>,
		invocation: NumberedTreeNode<Invoke>,
		client: S101Socket
	) => Promise<InvocationResult>
	/**
	 * Applies a consumer's setValue, normally with update(). The consumer is always answered: with that update when the
	 * handler makes one, or otherwise with the parameter's current value. What the handler resolves to is not used. It
	 * is given only a setValue on a writeable parameter, one whose access is Write or ReadWrite.
	 */
	onSetValue?: (parameter: NumberedTreeNode<Parameter>, value: EmberValue, client: S101Socket) => Promise<boolean>
	/**
	 * Applies a consumer's connection request, normally with updateMatrixConnection (or queueMatrixConnection, for a
	 * change made later); what it resolves to is ignored. It isn't given a request on a locked target.
	 */
	onMatrixOperation?: (
		matrix: NumberedTreeNode<Matrix>,
		connections: Connections,
		client: S101Socket
	) => Promise<unknown>

	private _server: S101Server
	private _clients: Set<S101Socket> = new Set()
	/** The consumers subscribed to each path */
	private _subscriptions = new Map<string, Set<S101Socket>>()
	private _pendingMatrixReplies = new Set<PendingMatrixReply>()
	private _pendingValueReplies = new Set<PendingValueReply>()
	/** The locked targets of each matrix, by its path */
	private _lockedTargets = new Map<string, Set<number>>()

	constructor(port: number, address?: string, options?: EmberServerOptions) {
		super()

		this.address = address
		this.port = port
		this._server = new S101Server(port, address, options)
		this._server.on('refused', (e) => this.emit('warn', e))

		this._server.on('connection', (client: S101Socket) => {
			this._clients.add(client)

			client.on('emberTree', (tree) => {
				// A consumer sends elements: a stream collection or an invocation result is no request to a provider
				if (tree.rootType === RootType.Elements) this._handleIncoming(tree, client)
			})

			client.on('error', (e) => {
				this.emit('clientError', client, e)
			})

			client.on('disconnected', () => {
				this._clearSubscription(client)
				this._clients.delete(client)
			})
		})
	}

	async init(tree: Children): Promise<void> {
		this._lockedTargets.clear() // the matrices they were of are gone
		const setParent = (parent: NumberedTreeNode<EmberElement>, child: NumberedTreeNode<EmberElement>) => {
			child.parent = parent
			if (child.children) {
				for (const c of child.children.values()) {
					setParent(child, c)
				}
			}
		}
		for (const rootEl of tree.values()) {
			if (rootEl.children) {
				for (const c of rootEl.children.values()) {
					setParent(rootEl, c)
				}
			}
		}
		this.tree = tree
		return this._server.listen()
	}

	discard(): void {
		this._clients.forEach((c) => {
			c.removeAllListeners()
		})
		this._clients.clear()
		this._server.server?.close()
	}

	update<T extends EmberElement>(element: NumberedTreeNode<T>, update: Partial<T>): void {
		// A matrix's connections, checked, since TypeScript can't tie the update to the element through T: before any
		// of the update is applied, so that one that isn't any is refused whole
		const connections: unknown = 'connections' in update ? update.connections : undefined
		if (isElementOfType(element, ElementType.Matrix) && connections !== undefined) {
			if (!isConnections(connections)) {
				throw new Error(`update: what was given as the connections of ${getPath(element)} are not connections`)
			}
			for (const connection of connections.values()) {
				this.updateMatrixConnection(element, connection)
			}
		}

		// The other properties replace the element's. A matrix's connections were merged in above, target by target: the
		// update lists only the targets it changes.
		const changes: Partial<T> = { ...update }
		if (element.contents.type === ElementType.Matrix) Reflect.deleteProperty(changes, 'connections')
		Object.assign(element.contents, changes)
		const el = toQualifiedEmberNode(element)
		// The change, without the element's children, which change on their own: a node's whole subtree went with it
		el.children = undefined
		const data = berEncode([el], RootType.Elements)

		// The consumers that listed the element, with a GetDirectory on its parent, as the specification says ("the
		// clients that have already sent a GetDirectory request to the parent node … This includes the online/offline
		// state of a node"), and those subscribed to the element itself. A node's change went only to the consumers
		// subscribed to the node, so one that had listed it missed it going offline. A matrix's targets and sources go
		// to the consumers of the matrix itself, a node's listing having none.
		const listsChanged = 'targets' in update || 'sources' in update
		const recipients = new Set([
			...((listsChanged ? undefined : this._subscriptions.get(parentPath(el.path))) ?? []),
			...(this._subscriptions.get(el.path) ?? []),
		])
		// A consumer waiting for the answer to its setValue on this element gets the update
		for (const pending of this._pendingValueReplies) {
			if (pending.path !== el.path) continue
			pending.answered = true
			recipients.add(pending.client)
		}
		recipients.forEach((client) => client.sendBER(data))
	}

	/**
	 * Applies a connection change to a matrix, keeping to its type, and reports every target that changed to the
	 * consumers subscribed to the matrix, with the disposition modified, as Lawo's EmberPlusRouter and
	 * TinyEmberPlusRouter do. A change that leaves the target as it was is reported as it is (the disposition tally,
	 * left out, as in a directory reply). In a one-to-N matrix (the default) or a one-to-one matrix a target has at most
	 * one source, so connecting a source replaces the one it had; of several sources requested, the last is kept. In a
	 * one-to-one matrix a source also has at most one target, so connecting it disconnects it from any other target.
	 *
	 * In an n-to-n matrix a change that adds sources beyond `maximumConnectsPerTarget` or `maximumTotalConnects` is
	 * refused: the target is left as it was, and its current state is reported instead.
	 *
	 * A change naming a target or source the matrix doesn't have is refused too, with a `warn` event: a real target's
	 * current state is reported, a target that doesn't exist reported not at all.
	 *
	 * A locked target is changed too: the lock is against consumers' requests, not the provider's own changes.
	 *
	 * @returns false when the change was refused
	 */
	updateMatrixConnection(element: NumberedTreeNode<Matrix>, update: Connection): boolean {
		const sources = this._sourcesAfter(element, update, 'connection change not applied')
		if (!sources) return false

		const connections = (element.contents.connections ??= new Map<number, Connection>())
		let connection = connections.get(update.target)
		if (!connection) {
			connection = new ConnectionImpl(update.target, [])
			connections.set(update.target, connection)
		}
		if (sameSources(connection.sources ?? [], sources)) {
			this._reportMatrixConnections(element, connectionsOf([connection]))
			return true
		}
		connection.sources = sources

		const changed = connectionsOf([connection])
		if (element.contents.matrixType === MatrixType.OneToOne) {
			for (const other of connections.values()) {
				if (other.target === connection.target) continue
				if (!other.sources?.some((source) => sources.includes(source))) continue
				other.sources = other.sources.filter((source) => !sources.includes(source))
				changed.set(other.target, other)
			}
		}

		this._reportMatrixConnections(element, changed, ConnectionDisposition.Modified)
		return true
	}

	/**
	 * Reports a connection change as pending: queued, to be made later. The consumers subscribed to the matrix (and a
	 * consumer waiting for the answer to its request on the target) are told the sources the target will have, as
	 * updateMatrixConnection would make them, with the disposition pending; the matrix isn't changed. When the change
	 * is made, make it with updateMatrixConnection, which reports it as modified; if it isn't, report the target as it
	 * is (updateMatrixConnection with its current sources, which reports it as tally). A change is refused as
	 * updateMatrixConnection refuses it, with the target's current state reported.
	 *
	 * @returns false when the change was refused
	 */
	queueMatrixConnection(element: NumberedTreeNode<Matrix>, update: Connection): boolean {
		const sources = this._sourcesAfter(element, update, 'connection change not queued')
		if (!sources) return false
		const queued = connectionsOf([new ConnectionImpl(update.target, sources)])
		this._reportMatrixConnections(element, queued, ConnectionDisposition.Pending)
		return true
	}

	/**
	 * Locks a matrix's target against consumers' connection requests, or unlocks it. A request on a locked target isn't
	 * handed to onMatrixOperation, and is answered with the target's current sources and the disposition locked. A
	 * handler that finds a target locked (the device refuses the change, say) can lock it before it returns, and the
	 * consumer is answered so too. The provider's own changes, with updateMatrixConnection, are applied all the same.
	 * Locking reports nothing: the Glow DTD has no lock state, only the disposition of an answer.
	 *
	 * @throws for a target the matrix doesn't have
	 */
	setMatrixTargetLocked(element: NumberedTreeNode<Matrix>, target: number, locked = true): void {
		const path = getPath(element)
		if (hasSignal(element.contents, 'target', target) === false) {
			throw new Error(`Matrix ${path}: target ${target} is not one of its targets`)
		}
		const lockedTargets = this._lockedTargets.get(path) ?? new Set<number>()
		if (locked) lockedTargets.add(target)
		else lockedTargets.delete(target)
		if (lockedTargets.size) this._lockedTargets.set(path, lockedTargets)
		else this._lockedTargets.delete(path)
	}

	/** Whether a matrix's target is locked against consumers' connection requests (setMatrixTargetLocked) */
	isMatrixTargetLocked(element: NumberedTreeNode<Matrix>, target: number): boolean {
		return this._lockedTargets.get(getPath(element))?.has(target) ?? false
	}

	/**
	 * The sources a target is to have after a change, keeping to the matrix's type, or undefined when the change is
	 * refused, with the target's current state reported: a change naming a target or source the matrix doesn't have
	 * (with a `warn` event saying it was not done, and why; a target that doesn't exist isn't reported), or, in an n-to-n
	 * matrix, one adding sources beyond its limits
	 */
	private _sourcesAfter(element: NumberedTreeNode<Matrix>, update: Connection, done: string): number[] | undefined {
		const current = element.contents.connections?.get(update.target) ?? new ConnectionImpl(update.target, [])
		const missing = missingSignals(element.contents, update)
		if (missing) {
			this.emit('warn', new Error(`Matrix ${getPath(element)}: ${done}: ${missing}`))
			if (hasSignal(element.contents, 'target', update.target) !== false) {
				this._reportMatrixConnections(element, connectionsOf([current]))
			}
			return undefined
		}

		const matrixType = element.contents.matrixType ?? MatrixType.OneToN
		const oneSourcePerTarget = matrixType !== MatrixType.NToN
		const currentSources = current.sources ?? []
		const requested = update.sources ?? []
		let sources: number[]
		switch (update.operation) {
			case ConnectionOperation.Connect:
				if (oneSourcePerTarget) {
					sources = requested.length ? requested.slice(-1) : currentSources
				} else {
					sources = [...new Set([...currentSources, ...requested])]
				}
				break
			case ConnectionOperation.Disconnect:
				sources = currentSources.filter((source) => !requested.includes(source))
				break
			case ConnectionOperation.Absolute:
			default:
				sources = oneSourcePerTarget ? requested.slice(-1) : [...new Set(requested)]
				break
		}

		if (matrixType === MatrixType.NToN && exceedsConnectLimits(element.contents, currentSources, sources)) {
			this._reportMatrixConnections(element, connectionsOf([current]))
			return undefined
		}
		return sources
	}

	/**
	 * Sends the given connections of a matrix, with the disposition given (none: tally), to the consumers subscribed to
	 * it, and to each consumer waiting for the answer to a connection request that named one of their targets
	 */
	private _reportMatrixConnections(
		element: NumberedTreeNode<Matrix>,
		changed: Connections,
		disposition?: ConnectionDisposition
	): void {
		const path = toQualifiedEmberNode(element).path
		const recipients = new Set(this._subscriptions.get(path) ?? [])
		// A consumer waiting for the answer to its connection request gets the report of a target it asked about
		for (const pending of this._pendingMatrixReplies) {
			if (pending.path !== path) continue
			let covered = false
			for (const target of changed.keys()) covered = pending.targets.delete(target) || covered
			if (covered) recipients.add(pending.client)
		}

		const reported = connectionsOf([...changed.values()].map((connection) => reportOf(connection, disposition)))
		const data = this._encodeMatrixConnections(element, reported)
		recipients.forEach((client) => client.sendBER(data))
	}

	/** The matrix with only the given connections, encoded as a report for consumers */
	private _encodeMatrixConnections(element: NumberedTreeNode<Matrix>, connections: Connections): Buffer {
		const qualified = toQualifiedEmberNode(element)
		qualified.contents = new MatrixImpl(qualified.contents.identifier, undefined, undefined, connections)
		return berEncode([qualified], RootType.Elements)
	}

	private _handleIncoming(incoming: DecodeResult<Array<RootElement>>, client: S101Socket) {
		for (const rootEl of incoming.value) {
			if (isElementOfType(rootEl, ElementType.Command) && 'number' in rootEl) {
				// command on root
				this._handleCommand('', rootEl, client).catch((e) => this.emit('error', e, client))
			} else if ('path' in rootEl) {
				this._handleNode(rootEl.path || '', rootEl, client)
			} else if ('number' in rootEl) {
				this._handleNode(rootEl.number + '' || '', rootEl, client)
			}
		}
	}

	private _handleNode(
		path: string,
		el: QualifiedElement<EmberElement> | NumberedTreeNode<EmberElement>,
		client: S101Socket
	) {
		const children = [...(el.children?.values() ?? [])]

		if (children[0] && isElementOfType(children[0], ElementType.Command)) {
			this._handleCommand(path, children[0], client).catch((e) => this.emit('error', e, client))
			return
		} else if (isElementOfType(el, ElementType.Matrix) && 'connections' in el.contents) {
			this._handleMatrix(path, el, client).catch((e) => this.emit('error', e, client))
		}

		if (!el.children) {
			if (isElementOfType(el, ElementType.Parameter)) {
				this._handleSetValue(path, el, client).catch((e) => this.emit('error', e, client))
			}
		} else {
			for (const c of children) {
				this._handleNode(path + '.' + c.number, c, client)
			}
		}
	}

	/**
	 * Hands a consumer's connection request to onMatrixOperation. The consumer always gets an answer for each target
	 * it named: the report of the change when the handler makes one with updateMatrixConnection, or otherwise (no
	 * handler, the change refused, the handler failed) the target's current state.
	 *
	 * A connection naming a target or source the matrix doesn't have is dropped, with a `warn` event: the handler isn't
	 * given it. A real target still gets its current state; a target that doesn't exist gets no answer, having no
	 * state to give (as the XACI answers none).
	 *
	 * A connection on a locked target isn't given to the handler either, also with a `warn` event, and is answered with
	 * the target's current state and the disposition locked; so is one on a target the handler locks without reporting
	 * it.
	 */
	private async _handleMatrix(
		path: string,
		el: QualifiedElement<Matrix> | NumberedTreeNode<Matrix>,
		client: S101Socket
	) {
		const matrix = this.getElementByPath(path)
		if (!matrix || !isElementOfType(matrix, ElementType.Matrix) || !el.contents.connections) return

		const requested = [...el.contents.connections.values()]
		const pending: PendingMatrixReply = {
			path: toQualifiedEmberNode(matrix).path,
			client,
			targets: new Set(requested.map((connection) => connection.target)),
		}
		const valid: Connections = new Map()
		for (const connection of requested) {
			const missing = missingSignals(matrix.contents, connection)
			if (!missing) {
				valid.set(connection.target, connection)
				continue
			}
			this.emit(
				'warn',
				new Error(`Matrix ${pending.path}: dropped a consumer's connection request: ${missing}`),
				client
			)
			if (hasSignal(matrix.contents, 'target', connection.target) === false)
				pending.targets.delete(connection.target)
		}
		for (const target of valid.keys()) {
			if (!this.isMatrixTargetLocked(matrix, target)) continue
			// Answered below, as locked
			valid.delete(target)
			this.emit(
				'warn',
				new Error(
					`Matrix ${pending.path}: refused a consumer's connection request: target ${target} is locked`
				),
				client
			)
		}
		this._pendingMatrixReplies.add(pending)

		try {
			if (this.onMatrixOperation && valid.size) await this.onMatrixOperation(matrix, valid, client)
		} finally {
			this._pendingMatrixReplies.delete(pending)
			if (pending.targets.size) {
				// Each target no report has answered: its current state, as locked if it is
				const current: Connections = new Map()
				for (const target of pending.targets) {
					const connection = matrix.contents.connections?.get(target) ?? new ConnectionImpl(target, [])
					const locked = this.isMatrixTargetLocked(matrix, target)
					current.set(target, reportOf(connection, locked ? ConnectionDisposition.Locked : undefined))
				}
				client.sendBER(this._encodeMatrixConnections(matrix, current))
			}
		}
	}

	private async _handleSetValue(
		path: string,
		el: QualifiedElement<Parameter> | NumberedTreeNode<Parameter>,
		client: S101Socket
	) {
		const tree = this.getElementByPath(path)
		if (!tree || !isElementOfType(tree, ElementType.Parameter) || el.contents.value === undefined) return

		// Only a parameter the provider makes writeable takes a consumer's value: Write or ReadWrite, as libember's
		// isWriteable() has it, an access left out being Read (the DTD's default). Any parameter's was handed to the
		// handler, so a read-only one took a consumer's value unless the handler checked its access itself.
		const access = tree.contents.access ?? ParameterAccess.Read
		if (access !== ParameterAccess.Write && access !== ParameterAccess.ReadWrite) {
			this.emit(
				'warn',
				new Error(`Parameter ${getPath(tree)}: a consumer's setValue refused: its access is ${access}`),
				client
			)
			client.sendBER(berEncode([toQualifiedEmberNode(tree)], RootType.Elements))
			return
		}

		const qualified = toQualifiedEmberNode(tree)
		const pending: PendingValueReply = { path: qualified.path, client, answered: false }
		this._pendingValueReplies.add(pending)

		try {
			if (this.onSetValue) await this.onSetValue(tree, el.contents.value, client)
		} finally {
			this._pendingValueReplies.delete(pending)
			// Not answered by an update() from the handler: refused, not applied (yet), failed, or no handler
			if (!pending.answered) client.sendBER(berEncode([toQualifiedEmberNode(tree)], RootType.Elements))
		}
	}

	private async _handleCommand(path: string, el: NumberedTreeNode<Command>, client: S101Socket) {
		// A command this library doesn't know is ignored, as a provider built on libember ignores it
		if (el.contents.number === CommandType.Unknown) return

		const tree = path ? this.getElementByPath(path) : this.tree
		if (!tree) return

		if (el.contents.number === CommandType.Subscribe) {
			this._subscribe(path, client)
		} else if (el.contents.number === CommandType.Unsubscribe) {
			this._unsubscribe(path, client)
		} else if (isGetDirectory(el.contents)) {
			this._subscribe(path, client) // send updates to client
			this._handleGetDirectory(tree, el.contents.dirFieldMask || FieldFlags.Default, client)
		} else if (isInvokeElement(el)) {
			// Only a function can be invoked. An Invoke on anything else (or on the root) fails, as one without a handler
			// does, rather than handing the handler something that isn't a function.
			const fn = 'contents' in tree && isElementOfType(tree, ElementType.Function) ? tree : undefined
			let result: InvocationResult
			if (this.onInvocation && fn) {
				result = await this.onInvocation(fn, el, client)
			} else {
				result = new InvocationResultImpl(el.contents.invocation?.id || -1, false)
			}
			const encoded = berEncode(result, RootType.InvocationResult)
			client.sendBER(encoded)
		}
	}

	getElementByPath(path: string, delimiter = '.'): NumberedTreeNode<EmberElement> | undefined {
		const getNext = (elements: Children, i?: string) =>
			[...elements.values()].find(
				(r) =>
					r.number === Number(i) ||
					('identifier' in r.contents && r.contents.identifier === i) ||
					('description' in r.contents && r.contents.description === i)
			)
		const getNextChild = (node: TreeElement<EmberElement>, i: string) => node.children && getNext(node.children, i)

		const numberedPath: Array<number> = []
		const pathArr = path.split(delimiter)
		const i = pathArr.shift()
		let tree: NumberedTreeNode<EmberElement> | undefined = getNext(this.tree, i)
		if (tree?.number) numberedPath.push(tree?.number)

		while (pathArr.length) {
			const i = pathArr.shift()
			if (!i) break
			if (!tree) break
			const next = getNextChild(tree, i)
			if (!next) {
				// not found
				return
			}
			tree = next
			if (!tree) return
			if (tree?.number) numberedPath.push(tree?.number)
		}

		return tree
	}

	private _subscribe(path: string, client: S101Socket) {
		// A Set: a consumer may ask for the same path more than once (a GetDirectory again, or a Subscribe after one),
		// and is sent each change once
		let clients = this._subscriptions.get(path)
		if (!clients) this._subscriptions.set(path, (clients = new Set()))
		clients.add(client)
	}
	private _unsubscribe(path: string, client: S101Socket) {
		const clients = this._subscriptions.get(path)
		if (!clients) return
		clients.delete(client)
		if (!clients.size) this._subscriptions.delete(path)
	}
	private _clearSubscription(client: S101Socket) {
		for (const path of [...this._subscriptions.keys()]) {
			this._unsubscribe(path, client)
		}
	}

	/**
	 * Answers a GetDirectory: on the root, the top-level elements; on a node with children, the node and its children
	 * (without theirs); on any other element, the element. Each element has the properties the request's field mask
	 * asks for, as TinyEmberPlusRouter gives them (directoryContents), and a matrix its targets, sources and
	 * connections only in a GetDirectory on the matrix itself. (The mask was ignored: every reply had everything.)
	 */
	private _handleGetDirectory(tree: Children | NumberedTreeNode<EmberElement>, mask: FieldFlags, client: S101Socket) {
		if (tree instanceof Map) {
			const response = [...tree.values()].map(
				(rootEl) => new NumberedTreeNodeImpl(rootEl.number, directoryContents(rootEl.contents, mask, false))
			)
			const data = berEncode(response, RootType.Elements)
			client.sendBER(data)
		} else {
			const qualified = toQualifiedEmberNode(tree)
			qualified.children = new Map() // destroy ref to this.tree
			qualified.contents = directoryContents(qualified.contents, mask, true)
			if (tree.children) {
				// the children, without their children, keyed by number
				for (const child of tree.children.values()) {
					const contents = directoryContents(child.contents, mask, false)
					qualified.children.set(child.number, new NumberedTreeNodeImpl(child.number, contents))
				}
			} else if (qualified.contents.type === ElementType.Node) {
				// node without children -> none of the properties should be set
				qualified.contents = new EmberNodeImpl()
				qualified.children = undefined
			}
			const data = berEncode([qualified], RootType.Elements)
			client.sendBER(data)
		}
	}
}

/**
 * A GetDirectory's field mask as TinyEmberPlusRouter takes it: the Glow DTD's numbers for the values, tested as bits,
 * so tree (3) is identifier (1) and description (2), and connections (5) identifier and value (4) as well. Default (0)
 * is all, as the DTD says ("same as all") and TinyEmberPlusRouter takes it. Sparse (-2) is all too: the DTD makes it
 * the same as all for an element without a template reference, and this server leaves out nothing a template gives.
 * (TinyEmberPlusRouter, older than sparse, tests its bits too, which leaves out the identifier.)
 */
const FIELD_MASK_BITS: Record<FieldFlags, number> = {
	[FieldFlags.Sparse]: -1,
	[FieldFlags.All]: -1,
	[FieldFlags.Default]: -1,
	[FieldFlags.Identifier]: 1,
	[FieldFlags.Description]: 2,
	[FieldFlags.Tree]: 3,
	[FieldFlags.Value]: 4,
	[FieldFlags.Connections]: 5,
}
const ALL_FIELDS = -1
const CONNECTIONS_FIELD = 5
/** The properties a field mask names by its own bits: every other property is given for all only */
const MASKED_PROPERTIES: Partial<Record<string, number>> = { identifier: 1, description: 2, value: 4 }
/** Given whatever the mask: the element's kind, a parameter's type (by which its value is read), a matrix's counts */
const ALWAYS_GIVEN = new Set(['type', 'parameterType', 'targetCount', 'sourceCount'])
/** A matrix's properties a directory reply gives only on the matrix itself */
const WHOLE_MATRIX_PROPERTIES = new Set(['targets', 'sources', 'connections'])

/**
 * An element's contents as a directory reply gives them for a field mask, as TinyEmberPlusRouter does: a copy, with the
 * identifier, description and value when the mask has their bits, a matrix's target and source counts always, and
 * every other property only for all. A matrix's targets and sources (for all) and connections (for connections) are
 * given only when the reply is on the matrix itself (`wholeMatrix`), the connections as directoryConnections makes
 * them. So a GetDirectory for values only gets each parameter's value, and one for connections on a matrix its
 * identifier, counts and connections. An element without what the mask asks for has no properties, as the DTD says.
 */
function directoryContents<T extends EmberElement>(contents: T, mask: FieldFlags, wholeMatrix: boolean): T {
	const bits = FIELD_MASK_BITS[mask]
	const has = (field: number) => (bits & field) === field
	const copy = { ...contents }
	for (const key of Object.keys(copy)) {
		const field = MASKED_PROPERTIES[key]
		const given = ALWAYS_GIVEN.has(key) || has(field ?? ALL_FIELDS)
		if (!given || WHOLE_MATRIX_PROPERTIES.has(key)) Reflect.deleteProperty(copy, key)
	}
	if (wholeMatrix && isMatrixContents(contents) && isMatrixContents(copy)) {
		if (has(ALL_FIELDS) && contents.targets) copy.targets = contents.targets
		if (has(ALL_FIELDS) && contents.sources) copy.sources = contents.sources
		if (has(CONNECTIONS_FIELD)) copy.connections = directoryConnections(contents)
	}
	return copy
}

function isMatrixContents(contents: EmberElement): contents is Matrix {
	return contents.type === ElementType.Matrix
}

/**
 * A target's connection as a report gives it: its sources, with the disposition given (none: tally), and no operation,
 * whatever the connection in the tree holds
 */
function reportOf(connection: Connection, disposition?: ConnectionDisposition): Connection {
	return new ConnectionImpl(connection.target, connection.sources, undefined, disposition)
}

/**
 * A matrix's connections as a directory reply on the matrix gives them, as Lawo's EmberPlusRouter and
 * TinyEmberPlusRouter do: one for every target, with its current sources (none given when it has none), and no
 * disposition or operation. The tree's connections were sent as they were, with whatever disposition or operation an
 * app had put on them, and without the targets they didn't cover. The targets are the matrix's list, or, linear, its
 * count; with neither, those the tree has connections for. Undefined when there are none.
 */
function directoryConnections(matrix: Matrix): Connections | undefined {
	const linear = (matrix.addressingMode ?? MatrixAddressingMode.Linear) === MatrixAddressingMode.Linear
	const count = matrix.targetCount
	const targets = matrix.targets
		? [...matrix.targets.keys()]
		: linear && count !== undefined && Number.isInteger(count) && count > 0
			? Array.from({ length: count }, (_, target) => target)
			: [...(matrix.connections?.keys() ?? [])]
	if (!targets.length) return undefined
	return connectionsOf(
		targets.map((target) => {
			const sources = matrix.connections?.get(target)?.sources
			return new ConnectionImpl(target, sources?.length ? sources : undefined)
		})
	)
}

/** Whether two lists of sources hold the same sources, in whatever order */
function sameSources(a: number[], b: number[]): boolean {
	return a.length === b.length && a.every((source) => b.includes(source))
}

/** What a connection names that the matrix doesn't have, a target or sources, if anything */
function missingSignals(matrix: Matrix, connection: Connection): string | undefined {
	if (hasSignal(matrix, 'target', connection.target) === false) {
		return `target ${connection.target} is not one of its targets`
	}
	const unknown = (connection.sources ?? []).filter((source) => hasSignal(matrix, 'source', source) === false)
	if (unknown.length)
		return `${unknown.length > 1 ? 'sources' : 'source'} ${unknown.join(', ')} not among its sources`
	return undefined
}

/**
 * Whether changing a target's sources from `current` to `next` adds sources beyond an n-to-n matrix's limits. A change
 * that adds none is never refused, so a matrix already over its limits can still be brought under them.
 */
function exceedsConnectLimits(matrix: Matrix, current: number[], next: number[]): boolean {
	if (next.length <= current.length) return false
	const { maximumConnectsPerTarget, maximumTotalConnects } = matrix
	if (maximumConnectsPerTarget !== undefined && next.length > maximumConnectsPerTarget) return true
	if (maximumTotalConnects === undefined) return false
	let total = next.length - current.length
	for (const connection of matrix.connections?.values() ?? []) {
		total += connection.sources?.length ?? 0
	}
	return total > maximumTotalConnects
}
