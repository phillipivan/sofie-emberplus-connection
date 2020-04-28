import { EmberTreeNode, EmberValue, RootElement } from '../../types/types'
import { Function } from '../../model/Function'
import { Invocation } from '../../model/Invocation'
import { InvocationResult } from '../../model/InvocationResult'
import { Matrix } from '../../model/Matrix'
import { Qualified } from '../../model/Qualified'
import { EmberElement } from '../../model/EmberElement'
import { Command } from '../../model/Command'
import { GetDirectory, CommandType, FieldFlags } from '../../model/Command'
import { ElementType } from '../../model/EmberElement'
import { Subscribe } from '../../model/Command'
import { Unsubscribe } from '../../model/Command'
import { Invoke } from '../../model/Command'
import { Parameter } from '../../model/Parameter'
import { Tree } from '../../model/Tree'
import { Connection } from '../../model/Connection'
import { ConnectionOperation } from '../../model/Connection'
import { Root } from '../../types/types'
import { Node } from '../../model/Node'

import { EventEmitter } from 'events'
import { S101Client } from '../Socket'
import { StreamEntry } from '../../model/StreamEntry'

export type RequestPromise<T> = Promise<RequestPromiseArguments<T>>
export interface RequestPromiseArguments<T> {
	sentOk: boolean
	reqId?: string
	cancel?: () => void
	response?: Promise<T>
}

export interface IRequest {
	reqId: string
	node: Qualified<EmberElement>
	resolve: (res: any) => void
	reject: (err: Error) => void
}

export enum ConnectionStatus {
	Error,
	Disconnected,
	Connecting,
	Connected
}

export interface IEmberClient {
	tree: EmberTreeNode
	isConnected: boolean
	requests: Map<string, IRequest>

	constructor: (host: string, port: number) => void

	connect: (host?: string, port?: number) => Promise<void>
	disconnect: () => Promise<void>

	/**
	 * Ember+ native commands:
	 */
	getDirectory: (node: RootElement) => RequestPromise<RootElement>
	subscribe: (node: EmberTreeNode, cb?: (node: EmberTreeNode) => void) => RequestPromise<void>
	unsubscribe: (node: EmberTreeNode) => RequestPromise<void>
	invokeFunction: (func: Function, args: Invocation['args']) => RequestPromise<InvocationResult>

	/**
	 * Send parts of tree to provider for setting stuff:
	 */
	setValue: (node: Tree<Parameter>, value: EmberValue) => RequestPromise<Tree<Parameter>>
	matrixConnect: (
		matrix: Tree<Matrix>,
		targetId: number,
		sources: Array<number>
	) => RequestPromise<Tree<Matrix>>
	matrixDisconnect: (
		matrix: Tree<Matrix>,
		targetId: number,
		sources: Array<number>
	) => RequestPromise<Tree<Matrix>>
	matrixSetConnection: (
		matrix: Tree<Matrix>,
		targetId: number,
		sources: Array<number>
	) => RequestPromise<Tree<Matrix>>

	/**
	 * Helpful functions for the tree:
	 */
	expand: (node: EmberTreeNode) => RequestPromise<EmberTreeNode> // TODO - is this the correct input / output?
	/**
	 * Attempts find an element in the tree. Optional callback to be called
	 * everytime there is an update for this node
	 *
	 * TODO - should this attempt to find the node locally first and do
	 * getDirectory for missing nodes or just send a qualified node with a
	 * getDirectory?
	 */
	getElementByPath: (
		path: string,
		cb?: (node: EmberTreeNode) => void
	) => RequestPromise<EmberTreeNode>
}

export default class EmberClient extends EventEmitter implements IEmberClient {
	host: string
	port: number

	private _requests = new Map<string, IRequest>()
	private _lastInvocation = 0
	private _tree: Array<EmberTreeNode> = [] // TODO - why not public?
	private _client: S101Client

	constructor(host: string, port = 9000) {
		super()

		this.host = host
		this.port = port

		this._client = new S101Client(this.host, this.port)
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
	getDirectory(node: RootElement, dirFieldMask?: FieldFlags, cb?: (node: EmberTreeNode) => void) {
		const command: GetDirectory = {
			type: ElementType.Command,
			number: CommandType.GetDirectory,
			dirFieldMask
		}
		return this._sendCommand<RootElement>(node, command)
	}
	subscribe(node: EmberTreeNode, cb?: (node: EmberTreeNode) => void) {
		const command: Subscribe = {
			type: ElementType.Command,
			number: CommandType.Subscribe
		}
		return this._sendCommand<void>(node, command, false)
	}
	unsubscribe(node: EmberTreeNode) {
		const command: Unsubscribe = {
			type: ElementType.Command,
			number: CommandType.Unsubscribe
		}
		return this._sendCommand<void>(node, command, false)
	}
	invoke(node: EmberTreeNode, ...args: Array<EmberValue>) {
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
	setValue(node: Tree<Parameter>, value: EmberValue): RequestPromise<Tree<Parameter>> {
		const qualifiedParam = assertQualifiedNode(node) as Qualified<Parameter>

		// TODO - validate value
		// TODO - should other properties be scrapped?
		qualifiedParam.value.value.value = value

		return this._sendRequest<Tree<Parameter>>(qualifiedParam)
	}
	matrixConnect(
		matrix: Tree<Matrix>,
		target: number,
		sources: Array<number>
	): RequestPromise<Tree<Matrix>> {
		return this._matrixMutation(matrix, target, sources, ConnectionOperation.Connect)
	}
	matrixDisconnect(
		matrix: Tree<Matrix>,
		target: number,
		sources: Array<number>
	): RequestPromise<Tree<Matrix>> {
		return this._matrixMutation(matrix, target, sources, ConnectionOperation.Disconnect)
	}
	matrixSetConnection(
		matrix: Tree<Matrix>,
		target: number,
		sources: Array<number>
	): RequestPromise<Tree<Matrix>> {
		return this._matrixMutation(matrix, target, sources, ConnectionOperation.Absolute)
	}

	/** Getting the tree: */
	// TODO - these functions don't necessarilly send a request, should they really
	// return a RequestPromise?
	expand(node: EmberTreeNode): RequestPromise<EmberTreeNode> {
		const nodes = [node]
		const p: Array<Promise<any>> = []

		let curNode
		while ((curNode = nodes.shift())) {
			if (curNode.children) {
				nodes.push(...curNode.children)
			} else {
				p.push(
					this.getDirectory(curNode).then(async (req) => {
						if (req.response) {
							const res = (await req.response) as Tree<EmberElement>
							return res.children?.map((c) => this.expand(c))
						}
					})
				)
			}
		}

		return Promise.all(p).then(
			() => ({
				sentOk: true,
				response: Promise.resolve(node)
			}),
			() => ({
				sentOk: false
			})
		)
	}
	async getElementByPath(
		path: string,
		cb?: (node: EmberTreeNode) => void
	): RequestPromise<EmberTreeNode> {
		const pathArr = path.split('.') // TODO - should we remain backward compatible and accept "/"?
		let tree: EmberTreeNode = this._tree[pathArr.shift()]

		for (let i = pathArr.shift(); pathArr.length; i = pathArr.shift()) {
			if (tree.children && tree.children[i]) {
				tree = tree.children[i]
			} else {
				const req = await this.getDirectory(tree)
				tree = (await req.response) as EmberTreeNode
				if (tree.children && tree.children[i]) {
					tree = tree.children[i]
				} else {
					throw new Error('Child not found')
				}
			}
		}

		return {
			sentOk: true,
			response: Promise.resolve(tree)
		}
	}

	private _matrixMutation(
		matrix: Tree<Matrix>,
		target: number,
		sources: Array<number>,
		operation: ConnectionOperation
	) {
		const qualifiedMatrix = assertQualifiedNode(matrix) as Qualified<Matrix>

		const connection: Connection = {
			operation,
			target,
			sources
		}

		qualifiedMatrix.value.value.connections = [connection]

		return this._sendRequest<Tree<Matrix>>(qualifiedMatrix)
	}

	private _sendCommand<T>(
		node: EmberTreeNode | RootElement,
		command: Command,
		hasResponse?: boolean
	) {
		// assert a qualified node
		const qualifiedNode = assertQualifiedNode(node)
		// insert command
		const commandNode = insertCommand(qualifiedNode, command)
		// send request
		return this._sendRequest<T>(commandNode, hasResponse)
	}

	private async _sendRequest<T>(
		node: Qualified<EmberElement>,
		hasResponse = true
	): RequestPromise<T> {
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

		const message = berEncode(node)
		const sentOk = await this._client.sendBER(message) // TODO - if sending multiple values to same path, should we do synchronous requests?

		return {
			...requestPromise,
			sentOk
		}
	}

	private _handleIncoming(node: Root) {
		// update tree:
		this._applyToTree(node)

		// check for subscriptiions:
		// use qualifiedNode.path
		// call subscriber

		// check for any outstanding requests and resolve them
		// iterate over requests, check path, if Invocation check id
		// resolve requests
	}

	private _applyToTree(node: Root) {
		if ((node as InvocationResult).id === undefined) {
			// node is not an InvocationResult

			// walk tree
			for (const rootElement of node as Array<RootElement>) {
				// TODO - these can also be StreamElements - how to figure out what is what?
				if ((rootElement as Qualified<EmberElement>).path) {
					// element is qualified
				} else {
					this._updateTree(
						rootElement as EmberTreeNode,
						this._tree[(rootElement as EmberTreeNode).value.number]
					)
				}
			}
		}
	}

	private _updateTree(update: EmberTreeNode, tree: EmberTreeNode) {
		if (update.value.type === tree.value.type) {
			switch (tree.value.type) {
				case ElementType.Node:
					this._updateNode(update.value as Node, tree.value as Node)
					break
				case ElementType.Parameter:
					this._updateParameter(update.value as Parameter, tree.value as Parameter)
					break
				case ElementType.Matrix:
					this._updateMatrix(update.value as Matrix, tree.value as Matrix)
					break
			}
		}
		if (update.children && tree.children) {
			// Update children
			for (const child of update.children) {
				const i = child.value.number
				const oldChild = tree.children[i] // TODO - check that this is safe
				this._updateTree(child, oldChild)
			}
		} else if (update.children) {
			tree.children = update.children
		}
	}

	private _updateNode(update: Node, node: Node) {
		updateProps<Node>(node, update, ['isOnline'])
	}

	private _updateParameter(update: Parameter, parameter: Parameter) {
		updateProps<Parameter>(parameter, update, ['value', 'isOnline', 'access'])
	}

	private _updateMatrix(update: Matrix, matrix: Matrix) {
		updateProps<Matrix>(matrix, update, ['targets', 'targetCount', 'sources', 'sourceCount'])
		// TODO - update connections
	}
}

// TODO - move to utils
export function assertQualifiedNode(node: RootElement): Qualified<EmberElement> {
	if ((node as Qualified<EmberElement>).path) {
		return node as Qualified<EmberElement>
	} else {
		return toQualifiedNode(node as EmberTreeNode)
	}
}

// TODO - what to do with any children. Do they keep their object pointers / references?
export function toQualifiedNode(node: EmberTreeNode): Qualified<EmberElement> {
	const findPath = (node: EmberTreeNode): string => {
		if (node.parent) {
			return findPath(node.parent) + '.' + node.index
		}
		return ''
	}
	const path = findPath(node)

	// TODO - use actual class!
	return {
		value: {
			value: node.value,
			children: node.children, // TODO - do we want the children?
			index: 1
		},
		path
	}
}

export function insertCommand(
	node: Qualified<EmberElement>,
	command: Command
): Qualified<EmberElement> {
	if (node.value.children) {
		// TODO - what does this mean? can we even insert a command?
	} else {
		node.value.children = [
			{
				index: 1,
				value: command
			}
		]
	}
	return node
}

export function updateProps<T>(oldProps: T, newProps: T, props?: Array<keyof T>) {
	if (!props) props = Object.keys(newProps) as Array<keyof T>

	for (let key of props) {
		if (newProps[key] !== oldProps[key]) {
			oldProps[key] = newProps[key]
		}
	}
}
