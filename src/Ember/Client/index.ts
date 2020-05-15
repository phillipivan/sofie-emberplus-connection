import {
	EmberValue,
	RootElement,
	QualifiedElement,
	TreeElement,
	NumberedTreeNode,
	EmberTypedValue,
	EmberTreeNode,
	RootType,
	QualifiedElements
} from '../../types/types'
import { InvocationResult } from '../../model/InvocationResult'
import { Matrix } from '../../model/Matrix'
import { EmberElement } from '../../model/EmberElement'
import { Command, GetDirectoryImpl, SubscribeImpl, UnsubscribeImpl } from '../../model/Command'
import { GetDirectory, CommandType, FieldFlags } from '../../model/Command'
import { ElementType } from '../../model/EmberElement'
import { Subscribe } from '../../model/Command'
import { Unsubscribe } from '../../model/Command'
import { Invoke } from '../../model/Command'
import { Parameter } from '../../model/Parameter'
import { Connection, ConnectionDisposition } from '../../model/Connection'
import { ConnectionOperation } from '../../model/Connection'
import { Root } from '../../types/types'
import { EmberNode } from '../../model/EmberNode'

import { EventEmitter } from 'events'
import { S101Client } from '../Socket'
import { getPath, assertQualifiedEmberNode, insertCommand, updateProps } from '../Lib/util'
import { berEncode } from '../..'
import { NumberedTreeNodeImpl } from '../../model/Tree'
import { EmberFunction } from '../../model/EmberFunction'

export type RequestPromise<T> = Promise<RequestPromiseArguments<T>>
export interface RequestPromiseArguments<T> {
	sentOk: boolean
	reqId?: string
	cancel?: () => void
	response?: Promise<T>
}

export interface IRequest {
	reqId: string
	node: RootElement
	resolve: (res: any) => void
	reject: (err: Error) => void
	cb?: (EmberNode: TreeElement<EmberElement>) => void
}

export interface ISubscription {
	path: string
	cb: (EmberNode: TreeElement<EmberElement>) => void
}

export interface IChange {
	path: string
	node: NumberedTreeNode<EmberElement>
}

export enum ConnectionStatus {
	Error,
	Disconnected,
	Connecting,
	Connected
}

export class EmberClient extends EventEmitter {
	host: string
	port: number

	private _requests = new Map<string, IRequest>()
	private _lastInvocation = 0
	private _tree: Array<NumberedTreeNode<EmberElement>> = [] // TODO - why not public?
	private _client: S101Client
	private _subscriptions: Array<ISubscription> = []

	constructor(host: string, port = 9000) {
		super()

		this.host = host
		this.port = port

		this._client = new S101Client(this.host, this.port)
		this._client.on('emberTree', (tree: Root) => this._handleIncoming(tree))
	}

	/**
	 * Opens an s101 socket to the provider.
	 * @param host The host of the emberplus provider
	 * @param port Port of the provider
	 */
	connect(host?: string, port?: number) {
		if (host) this.host = host
		if (port) this.port = port

		if (!this.host) return Promise.reject('No host specified')

		this._client.address = this.host
		this._client.port = this.port

		return this._client.connect()
	}

	/**
	 * Closes the s101 socket to the provider
	 */
	disconnect() {
		return this._client.disconnect()
	}

	/** Ember+ commands: */
	getDirectory(
		node: RootElement | Array<RootElement>,
		dirFieldMask?: FieldFlags,
		cb?: (EmberNode: TreeElement<EmberElement>) => void
	) {
		const command: GetDirectory = new GetDirectoryImpl(dirFieldMask)

		if (Array.isArray(node)) {
			if (cb)
				this._subscriptions.push({
					path: '', // TODO
					cb
				})

			return this._sendRequest<Root>(new NumberedTreeNodeImpl(0, command))
		}

		if (cb)
			this._subscriptions.push({
				path: getPath(node), // TODO
				cb
			})

		return this._sendCommand<RootElement>(node, command)
	}
	subscribe(
		node: RootElement | Array<RootElement>,
		cb?: (EmberNode: TreeElement<EmberElement>) => void
	) {
		const command: Subscribe = new SubscribeImpl()

		if (Array.isArray(node)) {
			if (cb)
				this._subscriptions.push({
					path: '', // TODO
					cb
				})

			return this._sendRequest<Root>(new NumberedTreeNodeImpl(0, command))
		}

		if (cb)
			this._subscriptions.push({
				path: getPath(node), // TODO
				cb
			})

		return this._sendCommand<void>(node, command, false)
	}
	unsubscribe(node: NumberedTreeNode<EmberElement> | Array<RootElement>) {
		const command: Unsubscribe = new UnsubscribeImpl()

		const path = Array.isArray(node) ? '' : getPath(node)
		for (let i in this._subscriptions) {
			if (this._subscriptions[i].path === path) {
				this._subscriptions.splice(Number(i), 1)
			}
		}

		if (Array.isArray(node)) {
			return this._sendRequest<Root>(new NumberedTreeNodeImpl(0, command))
		}

		return this._sendCommand<void>(node, command, false)
	}
	invoke(
		node: NumberedTreeNode<EmberFunction> | QualifiedElement<EmberFunction>,
		...args: Array<EmberTypedValue>
	) {
		// TODO - validate arguments
		const command: Invoke = {
			type: ElementType.Command,
			number: CommandType.Invoke,
			invocation: {
				id: ++this._lastInvocation,
				args
			}
		}
		return this._sendCommand<InvocationResult>(node, command, false)
	}

	/** Sending ember+ values */
	setValue(
		node: QualifiedElement<Parameter> | NumberedTreeNode<Parameter>,
		value: EmberValue
	): RequestPromise<TreeElement<Parameter>> {
		const qualifiedParam = assertQualifiedEmberNode(node) as QualifiedElement<Parameter>

		// TODO - validate value
		// TODO - should other properties be scrapped?
		qualifiedParam.contents.value = value

		return this._sendRequest<TreeElement<Parameter>>(qualifiedParam)
	}
	matrixConnect(
		matrix: QualifiedElement<Matrix> | NumberedTreeNode<Matrix>,
		target: number,
		sources: Array<number>
	): RequestPromise<TreeElement<Matrix>> {
		return this._matrixMutation(matrix, target, sources, ConnectionOperation.Connect)
	}
	matrixDisconnect(
		matrix: QualifiedElement<Matrix> | NumberedTreeNode<Matrix>,
		target: number,
		sources: Array<number>
	): RequestPromise<TreeElement<Matrix>> {
		return this._matrixMutation(matrix, target, sources, ConnectionOperation.Disconnect)
	}
	matrixSetConnection(
		matrix: QualifiedElement<Matrix> | NumberedTreeNode<Matrix>,
		target: number,
		sources: Array<number>
	): RequestPromise<TreeElement<Matrix>> {
		return this._matrixMutation(matrix, target, sources, ConnectionOperation.Absolute)
	}

	/** Getting the tree: */
	// TODO - these EmberFunctions don't necessarilly send a request, should they really
	// return a RequestPromise?
	async expand(node: NumberedTreeNode<EmberElement> | Array<RootElement>) {
		if (Array.isArray(node)) {
			await (await this.getDirectory(node)).response
			for (const root of this._tree) await this.expand(root)
			return
		}

		const emberNodes = [node]

		let curEmberNode
		while ((curEmberNode = emberNodes.shift())) {
			if (curEmberNode.children) {
				emberNodes.push(
					...curEmberNode.children.filter((c) => c.contents.type !== ElementType.Parameter)
				)
			} else {
				const req = await this.getDirectory(curEmberNode)
				if (!req.response) continue
				const res = (await req.response) as RootElement
				if (res.children) {
					res.children.forEach(
						(c) => c.contents.type !== ElementType.Parameter && emberNodes.push(c) // TODO - which types should not be expanded further?
					)
				}
			}
		}
	}
	async getElementByPath(
		path: string,
		cb?: (EmberNode: TreeElement<EmberElement>) => void
	): RequestPromise<NumberedTreeNode<EmberElement>> {
		const pathArr = path.split('.') // TODO - should we remain backward compatible and accept "/"?
		let tree: NumberedTreeNode<EmberElement> = this._tree[(pathArr.shift() as unknown) as number]

		for (let i = pathArr.shift(); pathArr.length; i = pathArr.shift()) {
			let index = (i as unknown) as number
			if (tree.children && tree.children[index]) {
				tree = tree.children[index]
			} else {
				const req = await this.getDirectory(tree)
				tree = (await req.response) as NumberedTreeNode<EmberElement> // TODO - can't this return qualified?
				if (tree.children && tree.children[index]) {
					tree = tree.children[index]
				} else {
					throw new Error('Child not found')
				}
			}
		}

		if (cb) {
			this._subscriptions.push({
				path,
				cb
			})
		}

		return {
			sentOk: true,
			response: Promise.resolve(tree)
		}
	}

	private _matrixMutation(
		matrix: QualifiedElement<Matrix> | NumberedTreeNode<Matrix>,
		target: number,
		sources: Array<number>,
		operation: ConnectionOperation
	) {
		const qualifiedMatrix = assertQualifiedEmberNode(matrix) as QualifiedElement<Matrix>

		const connection: Connection = {
			operation,
			target,
			sources
		}

		qualifiedMatrix.contents.connections = [connection]

		return this._sendRequest<TreeElement<Matrix>>(qualifiedMatrix)
	}

	private _sendCommand<T>(EmberNode: RootElement, command: Command, hasResponse?: boolean) {
		// assert a qualified EmberNode
		const qualifiedEmberNode = assertQualifiedEmberNode(EmberNode) // as QualifiedElements // kill me now
		// insert command
		const commandEmberNode = insertCommand(qualifiedEmberNode, command) // as QualifiedElements
		// send request
		return this._sendRequest<T>(commandEmberNode, hasResponse)
	}

	private async _sendRequest<T>(node: RootElement, hasResponse = true): RequestPromise<T> {
		const reqId = Math.random().toString(24).substr(-4)
		const requestPromise: RequestPromiseArguments<T> = {
			reqId,
			sentOk: false
		}

		if (hasResponse) {
			const p = new Promise<T>((resolve, reject) => {
				const request: IRequest = {
					reqId,
					node,
					resolve,
					reject
				}
				this._requests.set(reqId, request)

				requestPromise.cancel = () => {
					reject(new Error('Request cancelled'))
					this._requests.delete(reqId)
				}
			})
			requestPromise.response = p
		}

		const message = berEncode([node], RootType.Elements)
		const sentOk = await this._client.sendBER(message) // TODO - if sending multiple values to same path, should we do synchronous requests?

		return {
			...requestPromise,
			sentOk
		}
	}

	private _handleIncoming(node: Root) {
		// update tree:
		const changes = this._applyRootToTree(node)

		console.log(
			changes.map((c) => c.path),
			Array.from(this._requests.values()).map((r) => r.node.path)
		)

		// check for subscriptiions:
		for (const change of changes) {
			const subscription = this._subscriptions.find((s) => s.path === change.path)
			if (subscription) subscription.cb(change.node)
		}

		// check for any outstanding requests and resolve them
		// iterate over requests, check path, if Invocation check id
		// resolve requests
		for (const change of changes) {
			const req = Array.from(this._requests.values()).find(
				(s) =>
					(!('path' in s.node) && !change.path) || ('path' in s.node && s.node.path === change.path)
			)
			if (req) {
				if (req.cb) req.cb(change.node)
				if (req.resolve) {
					req.resolve(change.node)
					this._requests.delete(req.reqId)
				}
			}
		}
	}

	private _applyRootToTree(node: Root): Array<IChange> {
		let changes: Array<IChange> = []

		if ('id' in node) {
			// node is an InvocationResult
		} else {
			// EmberNode is not an InvocationResult

			// walk tree
			for (const rootElement of node as Array<RootElement>) {
				if ('identifier' in rootElement) {
					// rootElement is a StreamEntry
					continue
				} else if ('path' in rootElement) {
					// element is qualified
					const path: Array<string> = rootElement.path.split('.')
					let tree = this._tree[Number(path.shift())]
					let inserted = false

					if (!tree) throw new Error('No tree')

					for (const number of path) {
						if (!tree.children) tree.children = []
						if (!tree.children[Number(number)]) {
							tree.children[Number(number)] = {
								...rootElement,
								number: Number(number),
								parent: tree
							}
							changes = [
								...changes,
								{
									path: rootElement.path.substr(0, rootElement.path.length - 2),
									node: tree
								}
							]
							inserted = true
							break
						}
						tree = tree.children![Number(number)]
					}

					if (inserted) continue
					changes = [...changes, ...this._updateTree(rootElement, tree)]
				} else {
					if (this._tree[rootElement.number]) {
						changes = [
							...changes,
							...this._updateTree(
								rootElement as NumberedTreeNode<EmberElement>,
								this._tree[(rootElement as NumberedTreeNode<EmberElement>).number]
							)
						]
					} else {
						this._tree[rootElement.number] = rootElement
						// @ts-ignore
						changes = [...changes, { path: undefined, node: rootElement }]
					}
				}
			}
		}

		return changes
	}

	private _updateTree(
		update: TreeElement<EmberElement>,
		tree: NumberedTreeNode<EmberElement>
	): Array<IChange> {
		let changes: Array<IChange> = []

		if (update.contents.type === tree.contents.type) {
			changes.push({ path: getPath(tree), node: tree })
			switch (tree.contents.type) {
				case ElementType.Node:
					this._updateEmberNode(update.contents as EmberNode, tree.contents as EmberNode)
					break
				case ElementType.Parameter:
					this._updateParameter(update.contents as Parameter, tree.contents as Parameter)
					break
				case ElementType.Matrix:
					this._updateMatrix(update.contents as Matrix, tree.contents as Matrix)
					break
			}
		}
		if (update.children && tree.children) {
			// Update children
			for (const child of update.children) {
				const i = child.number
				const oldChild = tree.children[i] // TODO - check that this is safe
				changes = {
					...changes,
					...this._updateTree(child, oldChild)
				}
			}
		} else if (update.children) {
			changes.push({ path: getPath(tree), node: tree })
			tree.children = update.children
		}

		return changes
	}

	private _updateEmberNode(update: EmberNode, EmberNode: EmberNode) {
		updateProps<EmberNode>(EmberNode, update, ['isOnline'])
	}

	private _updateParameter(update: Parameter, parameter: Parameter) {
		updateProps<Parameter>(parameter, update, ['value', 'isOnline', 'access'])
	}

	private _updateMatrix(update: Matrix, matrix: Matrix) {
		updateProps<Matrix>(matrix, update, [
			'targets',
			'targetCount',
			'sources',
			'sourceCount',
			'connections'
		])

		// update connections
		if (update.connections) {
			if (matrix.connections) {
				// matrix already has connections
				for (const connection of Object.values(update.connections)) {
					if (
						!connection.disposition ||
						!(
							connection.disposition === ConnectionDisposition.Locked ||
							connection.disposition === ConnectionDisposition.Pending
						)
					) {
						// update is either generic, tally or modification
						let exists = false
						for (let i in matrix.connections) {
							if (matrix.connections[i].target === connection.target) {
								// found connection to update
								exists = true
								matrix.connections[i].sources = connection.sources
							}
						}

						if (!exists) {
							// connection to target does not exist yet
							matrix.connections[connection.target] = {
								target: connection.target,
								sources: connection.sources
							}
						}
					}
				}
			} else {
				// connections have not been set yet
				matrix.connections = update.connections
			}
		}
	}
}

// TODO - move to utils
