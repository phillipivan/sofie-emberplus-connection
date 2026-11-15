import { EventEmitter } from 'eventemitter3'

import { DecodeResult } from '../../encodings/ber/decoder/DecodeResult.js'
import { berEncode } from '../../encodings/ber/index.js'
import { Command, CommandType, FieldFlags, GetDirectory, Invoke } from '../../model/Command.js'
import { Connection, ConnectionImpl, ConnectionOperation } from '../../model/Connection.js'
import {
	Connections,
	ElementType,
	EmberElement,
	EmberFunction,
	EmberNode,
	EmberNodeImpl,
	InvocationResult,
	Matrix,
	MatrixImpl,
	MatrixType,
	NumberedTreeNodeImpl,
	Parameter,
} from '../../model/index.js'
import { InvocationResultImpl } from '../../model/InvocationResult.js'
import {
	Collection,
	EmberValue,
	NumberedTreeNode,
	QualifiedElement,
	RootElement,
	RootType,
	TreeElement,
} from '../../types/types.js'
import { toQualifiedEmberNode } from '../Lib/util.js'
import { S101Server } from '../Socket/S101Server.js'
import S101Socket from '../Socket/S101Socket.js'

export type EmberServerEvents = {
	error: [Error]
	clientError: [client: S101Socket, error: Error]
}

/** A consumer's connection request being handled: the targets it named that no report to it has covered yet */
interface PendingMatrixReply {
	path: string
	client: S101Socket
	targets: Set<number>
}

export class EmberServer extends EventEmitter<EmberServerEvents> {
	address: string | undefined
	port: number
	tree: Collection<NumberedTreeNode<EmberElement>> = {}

	onInvocation?: (
		emberFunction: NumberedTreeNode<EmberFunction>,
		invocation: NumberedTreeNode<Invoke>
	) => Promise<InvocationResult>
	onSetValue?: (parameter: NumberedTreeNode<Parameter>, value: EmberValue) => Promise<boolean>
	onMatrixOperation?: (Matrix: NumberedTreeNode<Matrix>, connection: Connections) => Promise<void>

	private _server: S101Server
	private _clients: Set<S101Socket> = new Set()
	private _subscriptions: { [path: string]: Array<S101Socket> } = {}
	private _pendingMatrixReplies = new Set<PendingMatrixReply>()

	constructor(port: number, address?: string) {
		super()

		this.address = address
		this.port = port
		this._server = new S101Server(port, address)

		this._server.on('connection', (client: S101Socket) => {
			this._clients.add(client)

			client.on('emberTree', (tree) =>
				this._handleIncoming(tree as DecodeResult<Collection<RootElement>>, client)
			)

			client.on('error', (e) => {
				this.emit('clientError', client, e)
			})

			client.on('disconnected', () => {
				this._clearSubscription(client)
				this._clients.delete(client)
			})
		})
	}

	async init(tree: Collection<NumberedTreeNode<EmberElement>>): Promise<void> {
		const setParent = (parent: NumberedTreeNode<EmberElement>, child: NumberedTreeNode<EmberElement>) => {
			child.parent = parent
			if (child.children) {
				for (const c of Object.values<NumberedTreeNode<EmberElement>>(child.children)) {
					setParent(child, c)
				}
			}
		}
		for (const rootEl of Object.values<NumberedTreeNode<EmberElement>>(tree)) {
			if (rootEl.children) {
				for (const c of Object.values<NumberedTreeNode<EmberElement>>(rootEl.children)) {
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
		if (element.contents.type === ElementType.Matrix) {
			const matrix: NumberedTreeNode<Matrix> = element as NumberedTreeNode<Matrix>
			const matrixUpdate: Partial<Matrix> = update as Partial<Matrix>

			if (matrixUpdate.connections) {
				// The Connections interface has no implicit string index signature, which Object.values needs
				for (const connection of Object.values<Connection>(
					// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
					matrixUpdate.connections as { [target: number]: Connection }
				)) {
					this.updateMatrixConnection(matrix, connection)
				}
			}
		}

		for (const [key, value] of Object.entries<any>(update)) {
			// A matrix's connections were merged in above, target by target: the update lists only the targets it changes
			if (element.contents.type === ElementType.Matrix && key === 'connections') continue
			element.contents[key as keyof T] = value
		}
		const el = toQualifiedEmberNode(element)
		const data = berEncode([el], RootType.Elements)
		let elPath = el.path
		if (el.contents.type !== ElementType.Node && !('targets' in update || 'sources' in update)) {
			const lastDotIndex = elPath.lastIndexOf('.')
			if (lastDotIndex > -1) {
				elPath = elPath.slice(0, lastDotIndex)
			} else {
				elPath = ''
			}
		}

		for (const [path, clients] of Object.entries<S101Socket[]>(this._subscriptions)) {
			if (elPath === path) {
				clients.forEach((client) => {
					client.sendBER(data)
				})
			}
		}
	}

	/**
	 * Applies a connection change to a matrix, keeping to its type, and reports every target that changed to the
	 * consumers subscribed to the matrix. In a one-to-N matrix (the default) or a one-to-one matrix a target has at most
	 * one source, so connecting a source replaces the one it had; of several sources requested, the last is kept. In a
	 * one-to-one matrix a source also has at most one target, so connecting it disconnects it from any other target.
	 */
	updateMatrixConnection(element: NumberedTreeNode<Matrix>, update: Connection): void {
		const connections = (element.contents.connections ??= {})
		const matrixType = element.contents.matrixType ?? MatrixType.OneToN
		const oneSourcePerTarget = matrixType !== MatrixType.NToN
		let connection = connections[update.target] as Connection | undefined
		if (!connection) {
			connection = new ConnectionImpl(update.target, [])
			connections[update.target] = connection
		}
		const current = connection.sources ?? []
		const requested = update.sources ?? []

		switch (update.operation) {
			case ConnectionOperation.Connect:
				if (oneSourcePerTarget) {
					if (requested.length) connection.sources = requested.slice(-1)
				} else {
					connection.sources = [...new Set([...current, ...requested])]
				}
				break
			case ConnectionOperation.Disconnect:
				connection.sources = current.filter((source) => !requested.includes(source))
				break
			case ConnectionOperation.Absolute:
			default:
				connection.sources = oneSourcePerTarget ? requested.slice(-1) : [...new Set(requested)]
				break
		}

		const changed: Connections = { [connection.target]: connection }
		if (matrixType === MatrixType.OneToOne) {
			const sources = connection.sources ?? []
			// The Connections interface has no implicit string index signature, which Object.values needs
			// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
			for (const other of Object.values<Connection>(connections as { [target: number]: Connection })) {
				if (other.target === connection.target) continue
				if (!other.sources?.some((source) => sources.includes(source))) continue
				other.sources = other.sources.filter((source) => !sources.includes(source))
				changed[other.target] = other
			}
		}

		const path = toQualifiedEmberNode(element).path
		const recipients = new Set(this._subscriptions[path] ?? [])
		// A consumer waiting for the answer to its connection request gets the report of a target it asked about
		for (const pending of this._pendingMatrixReplies) {
			if (pending.path !== path) continue
			let covered = false
			for (const target of Object.keys(changed)) covered = pending.targets.delete(Number(target)) || covered
			if (covered) recipients.add(pending.client)
		}

		const data = this._encodeMatrixConnections(element, changed)
		recipients.forEach((client) => client.sendBER(data))
	}

	/** The matrix with only the given connections, encoded as a report for consumers */
	private _encodeMatrixConnections(element: NumberedTreeNode<Matrix>, connections: Connections): Buffer {
		const qualified = toQualifiedEmberNode(element) as QualifiedElement<Matrix>
		qualified.contents = new MatrixImpl(qualified.contents.identifier, undefined, undefined, connections)
		return berEncode([qualified], RootType.Elements)
	}

	private _handleIncoming(incoming: DecodeResult<Collection<RootElement>>, client: S101Socket) {
		for (const rootEl of Object.values<RootElement>(incoming.value)) {
			if (rootEl.contents.type === ElementType.Command) {
				// command on root
				this._handleCommand('', rootEl as NumberedTreeNode<Command>, client).catch((e) => this.emit('error', e))
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
		const children = Object.values<NumberedTreeNode<EmberElement>>(el.children || {})

		if (children[0] && children[0].contents.type === ElementType.Command) {
			this._handleCommand(path, children[0] as NumberedTreeNode<Command>, client).catch((e) =>
				this.emit('error', e)
			)
			return
		} else if (el.contents.type === ElementType.Matrix && 'connections' in el.contents) {
			this._handleMatrix(path, el as QualifiedElement<Matrix> | NumberedTreeNode<Matrix>, client).catch((e) =>
				this.emit('error', e)
			)
		}

		if (!el.children) {
			if (el.contents.type === ElementType.Parameter) {
				this._handleSetValue(
					path,
					el as QualifiedElement<Parameter> | NumberedTreeNode<Parameter>,
					client
				).catch((e) => this.emit('error', e))
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
	 */
	private async _handleMatrix(
		path: string,
		el: QualifiedElement<Matrix> | NumberedTreeNode<Matrix>,
		client: S101Socket
	) {
		const tree = this.getElementByPath(path)
		if (!tree || tree.contents.type !== ElementType.Matrix || !el.contents.connections) return
		const matrix = tree as NumberedTreeNode<Matrix>

		const requested = Object.values<Connection>(
			// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
			el.contents.connections as { [target: number]: Connection }
		).map((connection) => connection.target)
		const pending: PendingMatrixReply = {
			path: toQualifiedEmberNode(matrix).path,
			client,
			targets: new Set(requested),
		}
		this._pendingMatrixReplies.add(pending)

		try {
			if (this.onMatrixOperation) await this.onMatrixOperation(matrix, el.contents.connections)
		} finally {
			this._pendingMatrixReplies.delete(pending)
			if (pending.targets.size) {
				const current: Connections = {}
				for (const target of pending.targets) {
					current[target] = matrix.contents.connections?.[target] ?? new ConnectionImpl(target, [])
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
		if (!tree || tree.contents.type !== ElementType.Parameter || el.contents.value === undefined) return

		let success = false
		if (this.onSetValue) {
			success = await this.onSetValue(tree as NumberedTreeNode<Parameter>, el.contents.value)
		}

		if (!success) {
			const qualified = toQualifiedEmberNode(tree)
			const encoded = berEncode([qualified], RootType.Elements)

			client.sendBER(encoded)
		}
	}

	private async _handleCommand(path: string, el: NumberedTreeNode<Command>, client: S101Socket) {
		const tree = path ? this.getElementByPath(path) : this.tree
		if (!tree) return

		if (el.contents.number === CommandType.Subscribe) {
			this._subscribe(path, client)
		} else if (el.contents.number === CommandType.Unsubscribe) {
			this._unsubscribe(path, client)
		} else if (el.contents.number === CommandType.GetDirectory) {
			this._subscribe(path, client) // send updates to client
			this._handleGetDirectory(tree, (el.contents as GetDirectory).dirFieldMask || FieldFlags.Default, client)
		} else if (el.contents.number === CommandType.Invoke) {
			let result: InvocationResult
			if (this.onInvocation) {
				result = await this.onInvocation(
					tree as NumberedTreeNode<EmberFunction>,
					el as NumberedTreeNode<Invoke>
				)
			} else {
				result = new InvocationResultImpl((el as NumberedTreeNode<Invoke>).contents.invocation?.id || -1, false)
			}
			const encoded = berEncode(result, RootType.InvocationResult)
			client.sendBER(encoded)
		}
	}

	getElementByPath(path: string, delimiter = '.'): NumberedTreeNode<EmberElement> | undefined {
		const getNext = (elements: Collection<NumberedTreeNode<EmberElement>>, i?: string) =>
			Object.values<NumberedTreeNode<EmberElement>>(elements || {}).find(
				(r) =>
					r.number === Number(i) ||
					(r.contents as EmberNode).identifier === i ||
					(r.contents as EmberNode).description === i
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
		const clients = this._subscriptions[path] || []
		// A consumer may ask for the same path more than once (a GetDirectory again, or a Subscribe after one);
		// listing it again would send it every change once per request.
		if (clients.includes(client)) return
		this._subscriptions[path] = [...clients, client]
	}
	private _unsubscribe(path: string, client: S101Socket) {
		if (!this._subscriptions[path]) return

		// (Removing entries with splice while looping over them skipped the entry after each one removed.)
		this._subscriptions[path] = this._subscriptions[path].filter((c) => c !== client)
	}
	private _clearSubscription(client: S101Socket) {
		for (const path of Object.keys(this._subscriptions)) {
			this._unsubscribe(path, client)
		}
	}

	private _handleGetDirectory(
		tree: Collection<NumberedTreeNode<EmberElement>> | NumberedTreeNode<EmberElement>,
		_dirFieldMasks: FieldFlags,
		client: S101Socket
	) {
		if (tree === this.tree) {
			// getDir on root
			const response: Collection<NumberedTreeNode<EmberElement>> = { ...this.tree }
			for (const [i, rootEl] of Object.entries<NumberedTreeNode<EmberElement>>(this.tree)) {
				response[i as unknown as number] = new NumberedTreeNodeImpl(rootEl.number, rootEl.contents)
			}
			const data = berEncode(response, RootType.Elements)
			client.sendBER(data)
		} else {
			const qualified = toQualifiedEmberNode(tree as NumberedTreeNode<EmberElement>)
			qualified.children = {} // destroy ref to this.tree
			if ('children' in tree && tree.children) {
				for (const [i, child] of Object.entries<NumberedTreeNode<EmberElement>>(tree.children)) {
					if (child.contents.type === ElementType.Matrix) {
						// matrix should not have connections, targets and sources:
						qualified.children[i as unknown as number] = new NumberedTreeNodeImpl(
							child.number,
							new MatrixImpl(
								child.contents.identifier,
								undefined,
								undefined,
								undefined,
								child.contents.description,
								child.contents.matrixType,
								child.contents.addressingMode,
								child.contents.targetCount,
								child.contents.sourceCount,
								child.contents.maximumTotalConnects,
								child.contents.maximumConnectsPerTarget,
								child.contents.parametersLocation,
								child.contents.gainParameterNumber,
								child.contents.labels,
								child.contents.schemaIdentifiers,
								child.contents.templateReference
							)
						)
					} else {
						qualified.children[i as unknown as number] = new NumberedTreeNodeImpl(
							child.number,
							child.contents
						)
					}
				}
			} else if (qualified.contents.type === ElementType.Node && !('children' in tree && tree.children)) {
				// node without children -> none of the properties should be set
				qualified.contents = new EmberNodeImpl()
				qualified.children = undefined
			}
			const data = berEncode([qualified], RootType.Elements)
			client.sendBER(data)
		}
	}
}
