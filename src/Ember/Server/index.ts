import { EventEmitter } from 'eventemitter3'

import { DecodeResult } from '../../encodings/ber/decoder/DecodeResult.js'
import { typedValue } from '../../encodings/ber/encoder/Parameter.js'
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
	enumEntries,
	hasSignal,
	InvocationResult,
	isConnections,
	isValueOfType,
	Matrix,
	MatrixAddressingMode,
	MatrixImpl,
	MatrixType,
	NumberedTreeNodeImpl,
	Parameter,
	ParameterAccess,
	ParameterType,
	StreamEntry,
	StreamFormat,
} from '../../model/index.js'
import { InvocationResultImpl } from '../../model/InvocationResult.js'
import { StreamEntryImpl } from '../../model/StreamEntry.js'
import { Children } from '../../model/Tree.js'
import {
	EmberTypedValue,
	EmberValue,
	NumberedTreeNode,
	QualifiedElement,
	RelativeOID,
	RootElement,
	RootType,
} from '../../types/types.js'
import { childPath, getPath, isElementOfType, isInvokeElement, parentPath, toQualifiedEmberNode } from '../Lib/util.js'
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
	/** The stream parameters of the tree (stream identifier not negative, not in a template), by stream identifier */
	private _streams = new Map<number, Array<{ path: RelativeOID; parameter: NumberedTreeNode<Parameter> }>>()
	/** The consumers that sent a Subscribe for each path: a stream parameter's values go only to them */
	private _streamSubscriptions = new Map<string, Set<S101Socket>>()
	/** The streams whose values changed since the last stream collections were sent, with the parameter changed last */
	private _changedStreams = new Map<number, NumberedTreeNode<Parameter>>()
	/** The stream parameters whose values were warned about as not fitting their format: not again until one fits */
	private _unfitStreamValues = new Set<string>()
	/** The parameters' values and defaults warned about as not allowed, by path and which: not again until allowed */
	private _disallowed = new Set<string>()
	/** The templates of the tree and the elements their definitions hold, with their paths: they don't change */
	private _templated = new WeakMap<NumberedTreeNode<EmberElement>, RelativeOID>()

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
		this._templated = new WeakMap()
		for (const { path, element, inTemplate, siblings } of elementsOf(tree)) {
			this._correctIdentifier(path, element, siblings)
			if (isElementOfType(element, ElementType.Parameter)) this._dropFactorWithFormula(path, element.contents)
			if (isElementOfType(element, ElementType.Matrix)) this._dropUnknownSignals(path, element.contents)
			if (inTemplate) this._templated.set(element, path)
		}
		this._changedStreams.clear()
		this._unfitStreamValues.clear()
		this._indexStreams()
		this._disallowed.clear()
		for (const { path, element, inTemplate } of elementsOf(tree)) {
			if (inTemplate || !isElementOfType(element, ElementType.Parameter)) continue
			this._checkStreamParameter(path, element.contents)
			this._checkRange(path, element.contents, { limits: true, value: true, defaultValue: true })
		}
		for (const streamIdentifier of this._streams.keys()) this._checkStreamLayout(streamIdentifier)
		return this._server.listen()
	}

	/**
	 * Corrects an element's identifier the specification doesn't allow ("The identifier string must not contain the
	 * character "/" … and must begin with a letter or the lower line character"), in the tree, with a `warn` event: as
	 * legalIdentifier makes it, and with the identifier as it was for the element's description, when it has none, as a
	 * description "shall be displayed instead of the identifier". One was only warned about, so it was published as it
	 * was.
	 *
	 * @throws when the corrected identifier is a sibling's (`siblings`, the collection the element is in), as
	 * identifiers are "unique within the current context"
	 */
	private _correctIdentifier(
		path: RelativeOID,
		element: NumberedTreeNode<EmberElement>,
		siblings: Children | undefined
	): void {
		const contents = element.contents
		if (!('identifier' in contents) || contents.identifier === undefined) return
		const original = contents.identifier
		const legal = this._legalIdentifier(path, original, element, siblings)
		if (legal === original) return
		contents.identifier = legal
		contents.description ??= original
	}

	/**
	 * An identifier as the element is to have it: as legalIdentifier makes it, with a `warn` event when it isn't as it
	 * was given
	 *
	 * @throws when that is a sibling's identifier
	 */
	private _legalIdentifier(
		path: RelativeOID,
		identifier: string,
		element: NumberedTreeNode<EmberElement>,
		siblings: Children | undefined
	): string {
		const legal = legalIdentifier(identifier)
		if (legal === identifier) return identifier
		for (const sibling of siblings?.values() ?? []) {
			if (sibling !== element && 'identifier' in sibling.contents && sibling.contents.identifier === legal) {
				throw new Error(
					`Element ${path}: identifier '${identifier}' isn't allowed, and '${legal}', which it would be corrected to, is element ${childPath(parentPath(path), sibling.number)}'s`
				)
			}
		}
		this.emit(
			'warn',
			new Error(
				`Element ${path}: identifier '${identifier}' corrected to '${legal}': an identifier has no "/" and begins with a letter or "_"`
			)
		)
		return legal
	}

	/**
	 * Notes the tree's stream parameters, by stream identifier: those with a stream identifier that isn't negative ("a
	 * globally unique identifier which must not be negative"), outside template definitions
	 */
	private _indexStreams(): void {
		this._streams.clear()
		for (const { path, element, inTemplate } of elementsOf(this.tree)) {
			if (inTemplate || !isElementOfType(element, ElementType.Parameter)) continue
			const { streamIdentifier } = element.contents
			if (streamIdentifier === undefined || !isStreamIdentifier(streamIdentifier)) continue
			const parameters = this._streams.get(streamIdentifier) ?? []
			parameters.push({ path, parameter: element })
			this._streams.set(streamIdentifier, parameters)
		}
	}

	/**
	 * Warns, with `warn` events, about a parameter's stream properties the specification doesn't allow: a negative
	 * stream identifier (not a stream); a stream parameter of the type string or Boolean ("its type must not be a string
	 * or Boolean"), streamed all the same; a stream descriptor whose format doesn't suit the parameter's type ("The value
	 * type of the descriptor must match the Type or the Value property": integer formats an integer or an enumeration,
	 * float formats a real); and a negative offset, which no value can be written at.
	 */
	private _checkStreamParameter(path: RelativeOID, parameter: Parameter): void {
		const { streamIdentifier, parameterType, streamDescriptor } = parameter
		if (streamIdentifier === undefined) return
		const warn = (problem: string) => this.emit('warn', new Error(`Parameter ${path}: ${problem}`))
		if (!isStreamIdentifier(streamIdentifier)) {
			warn(`stream identifier ${streamIdentifier} is negative: not a stream`)
			return
		}
		if (parameterType === ParameterType.String || parameterType === ParameterType.Boolean) {
			warn(`a stream parameter's type must not be ${parameterType}`)
		}
		if (!streamDescriptor) return
		if (!formatSuits(streamDescriptor.format, parameterType)) {
			warn(`its stream format ${streamDescriptor.format} doesn't suit its type, ${parameterType}`)
		}
		if (!Number.isInteger(streamDescriptor.offset) || streamDescriptor.offset < 0) {
			warn(
				`its stream offset ${streamDescriptor.offset} isn't a whole number of bytes from 0: left out of the stream`
			)
		}
	}

	/**
	 * Warns, with `warn` events, about the layout of a stream several parameters share: some with stream descriptors and
	 * some without, those without being left out of it; none with one ("A StreamDescriptor is required when a single
	 * stream entry contains more than one value"), each value sent then being taken as all of theirs; and values
	 * overlapping in its octets.
	 */
	private _checkStreamLayout(streamIdentifier: number): void {
		const parameters = this._streams.get(streamIdentifier) ?? []
		if (parameters.length < 2) return
		const warn = (problem: string) => this.emit('warn', new Error(`Stream ${streamIdentifier}: ${problem}`))
		const paths = (list: typeof parameters) => list.map(({ path }) => path).join(', ')
		const described = parameters.filter(({ parameter }) => parameter.contents.streamDescriptor)
		const undescribed = parameters.filter(({ parameter }) => !parameter.contents.streamDescriptor)
		if (!described.length) {
			warn(`${paths(undescribed)} share it without stream descriptors: each value sent is taken as all of theirs`)
			return
		}
		if (undescribed.length) {
			warn(
				`${paths(undescribed)}, without a stream descriptor, left out of it, which ${paths(described)} share by theirs`
			)
		}
		const spans = described
			.map(({ path, parameter }) => {
				const descriptor = parameter.contents.streamDescriptor
				const start = descriptor?.offset ?? 0
				return { path, start, end: start + (descriptor ? STREAM_FORMATS[descriptor.format].size : 0) }
			})
			.sort((a, b) => a.start - b.start)
		let previous = spans[0]
		for (const span of spans.slice(1)) {
			if (previous && span.start < previous.end) {
				warn(
					`the values of ${previous.path} (bytes ${previous.start} to ${previous.end - 1}) and ${span.path} (bytes ${span.start} to ${span.end - 1}) overlap`
				)
			}
			if (!previous || span.end > previous.end) previous = span
		}
	}

	/** Sends a stream's value with the next stream collections, sent once whatever else changes now is done */
	private _queueStream(streamIdentifier: number, parameter: NumberedTreeNode<Parameter>): void {
		if (!this._changedStreams.size) setImmediate(() => this._sendStreams())
		this._changedStreams.set(streamIdentifier, parameter)
	}

	/**
	 * Sends each consumer one stream collection with the changed streams it subscribed to: the streams of the
	 * parameters it sent a Subscribe for. A stream several parameters share, packed by their stream descriptors, goes
	 * to a consumer subscribed to any of them.
	 */
	private _sendStreams(): void {
		const byClient = new Map<S101Socket, Map<number, StreamEntry>>()
		for (const [streamIdentifier, changed] of this._changedStreams) {
			const entry = this._streamEntry(streamIdentifier, changed)
			if (!entry) continue
			for (const { path } of this._streams.get(streamIdentifier) ?? []) {
				for (const client of this._streamSubscriptions.get(path) ?? []) {
					const entries = byClient.get(client) ?? new Map<number, StreamEntry>()
					entries.set(streamIdentifier, entry)
					byClient.set(client, entries)
				}
			}
		}
		this._changedStreams.clear()
		byClient.forEach((entries, client) => client.sendBER(berEncode([...entries.values()], RootType.Streams)))
	}

	/**
	 * A stream's entry. For a stream whose parameters have stream descriptors ("required when a single stream entry
	 * contains more than one value and is provided as octet string"), octets with each one's value at its offset, in
	 * its format; otherwise the value of the parameter changed, as its type has it.
	 */
	private _streamEntry(streamIdentifier: number, changed: NumberedTreeNode<Parameter>): StreamEntry | undefined {
		const described = (this._streams.get(streamIdentifier) ?? []).filter(
			({ parameter }) => parameter.contents.streamDescriptor
		)
		if (!described.length) {
			try {
				return new StreamEntryImpl(streamIdentifier, typedValue(changed.contents, 'value'))
			} catch (e) {
				this.emit('warn', normalizeWarning(e))
				return undefined
			}
		}
		let length = 0
		for (const { parameter } of described) {
			const descriptor = parameter.contents.streamDescriptor
			if (descriptor) length = Math.max(length, descriptor.offset + STREAM_FORMATS[descriptor.format].size)
		}
		const octets = Buffer.alloc(Math.max(length, 0))
		for (const { path, parameter } of described) {
			const descriptor = parameter.contents.streamDescriptor
			const value = parameter.contents.value
			if (!descriptor || typeof value !== 'number') continue
			try {
				STREAM_FORMATS[descriptor.format].write(octets, value, descriptor.offset)
				this._unfitStreamValues.delete(path)
			} catch {
				// Warned about once, and again only once a value has fitted in between: a meter held out of its format's
				// range is sent at every stream collection, some twenty a second
				if (this._unfitStreamValues.has(path)) continue
				this._unfitStreamValues.add(path)
				this.emit(
					'warn',
					new Error(
						`Parameter ${path}: stream value ${value} doesn't fit ${descriptor.format} at offset ${descriptor.offset}: left out`
					)
				)
			}
		}
		return new StreamEntryImpl(streamIdentifier, { type: ParameterType.Octets, value: octets })
	}

	/**
	 * Drops a parameter's factor when it has a formula too, with a `warn` event: "If a factor is specified, a formula
	 * must not be provided", and "If a formula is specified, a factor must not be provided". The formula, the more
	 * specific of the two, is kept, as Model.displayValue uses it before a factor. Both were sent, for consumers to guess
	 * which to apply.
	 */
	private _dropFactorWithFormula(path: RelativeOID, parameter: Parameter): void {
		if (!parameter.formula || parameter.factor === undefined) return
		this.emit(
			'warn',
			new Error(
				`Parameter ${path}: a formula and a factor must not both be given: factor ${parameter.factor} dropped`
			)
		)
		parameter.factor = undefined
	}

	/**
	 * Drops from a matrix's connections, with a `warn` event for each, a connection under a target the matrix doesn't
	 * have, and from the others the sources it doesn't have, as far as its signals are known (Model.hasSignal: its
	 * lists, or a linear matrix's counts), as a consumer's connection request or a provider's change naming them is
	 * refused. A connection under a target it doesn't have was kept in the tree, and left out of directory replies
	 * without a word, and a source it doesn't have was sent to consumers in them.
	 */
	private _dropUnknownSignals(path: RelativeOID, matrix: Matrix): void {
		const connections = matrix.connections
		if (!connections) return
		for (const [key, connection] of [...connections]) {
			const target = connection.target
			if (hasSignal(matrix, 'target', target) === false) {
				connections.delete(key)
				this.emit(
					'warn',
					new Error(
						`Matrix ${path}: the connection of target ${target}, which isn't one of its targets, dropped`
					)
				)
				continue
			}
			const sources = connection.sources ?? []
			const unknown = sources.filter((source) => hasSignal(matrix, 'source', source) === false)
			if (!unknown.length) continue
			connection.sources = sources.filter((source) => !unknown.includes(source))
			const which = `${unknown.length > 1 ? 'sources' : 'source'} ${unknown.join(', ')}`
			this.emit('warn', new Error(`Matrix ${path}: ${which} of target ${target}, not among its sources, dropped`))
		}
	}

	/**
	 * Warns, with `warn` events, about what of a parameter's range, value and default it doesn't allow: an inverted
	 * range (the minimum above the maximum), which isn't checked, and a value or default below the minimum, above the
	 * maximum, or, for an enumeration, none of its entries (valueProblem). A value or default is warned about once,
	 * and again only once it has been allowed in between, so a meter held above its maximum isn't warned about at every
	 * report. Only warns: a provider's value is the device's.
	 */
	private _checkRange(
		path: RelativeOID,
		parameter: Parameter,
		check: { limits: boolean; value: boolean; defaultValue: boolean }
	): void {
		const { minimum, maximum, inverted } = valueRange(parameter)
		if (check.limits && inverted) {
			this.emit(
				'warn',
				new Error(
					`Parameter ${path}: its minimum, ${minimum}, is above its maximum, ${maximum}: its range isn't checked`
				)
			)
		}
		for (const key of ['value', 'defaultValue'] as const) {
			if (!check[key]) continue
			const problem = valueProblem(parameter, parameter[key])
			const disallowed = `${path} ${key}`
			if (!problem) {
				this._disallowed.delete(disallowed)
			} else if (!this._disallowed.has(disallowed)) {
				this._disallowed.add(disallowed)
				this.emit(
					'warn',
					new Error(`Parameter ${path}: its ${key === 'value' ? 'value' : 'default'} ${problem}`)
				)
			}
		}
	}

	/**
	 * Refuses a change to a template, or to an element its definition holds, with a `warn` event: "A template definition
	 * has to remain constant over the course of a session", and "No value change notifications must be emitted for
	 * template elements". It was applied and reported (an element in a definition by its number alone, having no
	 * parent). Gives whether it refused.
	 */
	private _refuseTemplated(element: NumberedTreeNode<EmberElement>): boolean {
		const path = this._templated.get(element)
		if (path === undefined) return false
		this.emit('warn', new Error(`Element ${path}: a template definition, which doesn't change: change not applied`))
		return true
	}

	/**
	 * Sets TCP_NODELAY on the consumers' connections, those connected now and those to come: true sends each message at
	 * once, false (Node's default) lets the system hold a small one back for a moment to send it with the next (Nagle's
	 * algorithm). True lowers the latency of small messages, such as a value's change, at the cost of more, smaller
	 * packets.
	 */
	setNoDelay(noDelay = true): void {
		this._server.setNoDelay(noDelay)
		for (const client of this._clients) client.setNoDelay(noDelay)
	}

	discard(): void {
		this._clients.forEach((c) => {
			c.removeAllListeners()
		})
		this._clients.clear()
		this._server.server?.close()
	}

	update<T extends EmberElement>(element: NumberedTreeNode<T>, update: Partial<T>): void {
		if (this._refuseTemplated(element)) return
		if (isElementOfType(element, ElementType.Parameter)) checkParameterUpdate(element, update)

		// An identifier the specification doesn't allow, corrected (see _correctIdentifier): before any of the update
		// is applied, so that one that would be a sibling's refuses the update whole. "The identifier of a node must
		// never change. Otherwise a consumer cannot refer to a specific node or parameter any more": warned about, but
		// applied, the tree being the provider's.
		const identifier: unknown = 'identifier' in update ? update.identifier : undefined
		let corrected: { original: string; legal: string } | undefined
		if (typeof identifier === 'string') {
			const path = getPath(element)
			const siblings = element.parent ? element.parent.children : this.tree
			const legal = this._legalIdentifier(path, identifier, element, siblings)
			const current = 'identifier' in element.contents ? element.contents.identifier : undefined
			if (current !== undefined && legal !== current) {
				this.emit('warn', new Error(`Element ${path}: identifier changed from '${current}' to '${legal}'`))
			}
			if (legal !== identifier) corrected = { original: identifier, legal }
		}
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
		if (corrected && 'identifier' in element.contents) {
			element.contents.identifier = corrected.legal
			element.contents.description ??= corrected.original
		}

		if (isElementOfType(element, ElementType.Parameter))
			this._dropFactorWithFormula(getPath(element), element.contents)
		// A matrix's signals changed: its connections to signals it no longer has go
		const signalProperties = ['targets', 'sources', 'targetCount', 'sourceCount', 'addressingMode']
		if (isElementOfType(element, ElementType.Matrix) && signalProperties.some((key) => key in update)) {
			this._dropUnknownSignals(getPath(element), element.contents)
		}

		// A value, default or range the parameter doesn't allow, warned about, but applied: the device reports what it is
		if (isElementOfType(element, ElementType.Parameter) && !this._templated.has(element)) {
			const limits = 'minimum' in update || 'maximum' in update
			const allowed = limits || 'enumeration' in update || 'enumMap' in update || 'parameterType' in update
			this._checkRange(getPath(element), element.contents, {
				limits,
				value: allowed || 'value' in update,
				defaultValue: allowed || 'defaultValue' in update,
			})
		}

		// A stream parameter's value goes, in a stream collection, only to the consumers that subscribed to it: "These
		// notifications must not be sent when the parameter has a stream identifier". Its other properties are notified
		// as any element's are, without the value. It was notified as any parameter.
		const streamChange = 'streamIdentifier' in update || 'streamDescriptor' in update || 'parameterType' in update
		if (streamChange && isElementOfType(element, ElementType.Parameter) && !this._templated.has(element)) {
			// The parameter's stream properties, and the layout of the stream it is in, checked as at init()
			this._indexStreams()
			this._checkStreamParameter(getPath(element), element.contents)
			const changed = element.contents.streamIdentifier
			if (changed !== undefined && isStreamIdentifier(changed)) this._checkStreamLayout(changed)
		}
		const streamIdentifier = isElementOfType(element, ElementType.Parameter)
			? element.contents.streamIdentifier
			: undefined
		const streamed =
			isElementOfType(element, ElementType.Parameter) &&
			streamIdentifier !== undefined &&
			isStreamIdentifier(streamIdentifier) &&
			!this._templated.has(element)
		if (streamed && isElementOfType(element, ElementType.Parameter) && 'value' in update) {
			this._queueStream(streamIdentifier, element)
		}
		if (streamed && Object.keys(update).every((key) => key === 'value')) return
		const el = toQualifiedEmberNode(element)
		// The change, without the element's children, which change on their own: a node's whole subtree went with it
		el.children = undefined
		if (streamed) {
			const contents = { ...el.contents }
			Reflect.deleteProperty(contents, 'value')
			el.contents = contents
		}
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
		if (this._refuseTemplated(element)) return undefined
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
		const matrix = this._elementAt(path)
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
		const tree = this._elementAt(path)
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

		// Only a value of the parameter's type, and for an integer or an enumeration a whole number: "If the value is
		// invalid, the provider shall respond with the current value". Any was handed to the handler, so one that
		// applied it (as update() would) left a value in the tree that the encoder refuses, and every reply giving the
		// parameter failed. Its range (minimum, maximum, entries) is the handler's to check.
		const value = el.contents.value
		const { parameterType } = tree.contents
		if (!fitsType(parameterType, value)) {
			this.emit(
				'warn',
				new Error(
					`Parameter ${getPath(tree)}: a consumer's setValue refused: ${String(value)} doesn't fit its type, ${parameterType}`
				),
				client
			)
			client.sendBER(berEncode([toQualifiedEmberNode(tree)], RootType.Elements))
			return
		}

		// Within its range and, for an enumeration, one of its entries: the minimum and maximum are "the smallest value
		// allowed" and "the largest value allowed". Any was handed to the handler.
		const problem = valueProblem(tree.contents, value)
		if (problem) {
			this.emit(
				'warn',
				new Error(`Parameter ${getPath(tree)}: a consumer's setValue refused: ${problem}`),
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

		const tree = path ? this._elementAt(path) : this.tree
		if (!tree) return

		if (el.contents.number === CommandType.Subscribe) {
			this._subscribe(path, client)
			this._subscribe(path, client, this._streamSubscriptions) // a stream parameter's values come only so
		} else if (el.contents.number === CommandType.Unsubscribe) {
			// On a node (or the root), "all parameter subscriptions for that consumer must be removed": those at the node
			// and below it, which only the node's own were. On anything else, the element's own.
			if (tree instanceof Map || isElementOfType(tree, ElementType.Node)) this._unsubscribeBelow(path, client)
			else this._unsubscribe(path, client)
		} else if (isGetDirectory(el.contents)) {
			this._subscribe(path, client) // send updates to client
			this._handleGetDirectory(tree, el.contents.dirFieldMask || FieldFlags.Default, client)
		} else if (isInvokeElement(el)) {
			// Only a function can be invoked. An Invoke on anything else (or on the root) fails, as one without a handler
			// does, rather than handing the handler something that isn't a function.
			const fn = 'contents' in tree && isElementOfType(tree, ElementType.Function) ? tree : undefined
			// The arguments, as the function describes them: as many, each of its type. Any were handed to the handler.
			const problem = fn && argumentsProblem(fn.contents, el.contents.invocation?.args ?? [])
			if (fn && problem) {
				this.emit('warn', new Error(`Function ${getPath(fn)}: a consumer's Invoke refused: ${problem}`), client)
			}
			let result: InvocationResult
			if (this.onInvocation && fn && !problem) {
				result = await this.onInvocation(fn, el, client)
			} else {
				// Failed: not a function, arguments that don't fit, or no handler. The consumer's id, 0 included (it was
				// answered as -1, which the consumer couldn't match); -1 without one.
				result = new InvocationResultImpl(el.contents.invocation?.id ?? -1, false)
			}
			const encoded = berEncode(result, RootType.InvocationResult)
			client.sendBER(encoded)
		}
	}

	/**
	 * The element at a path in the tree, for the provider's own use: by numbers (`1.2.3`), or by identifiers,
	 * descriptions or numbers (`device.channel.gain`), as the client's getElementByPath matches them. A path of numbers
	 * only is matched by numbers alone; in any other, each part by an identifier, or else a description, or else a
	 * number, among all the siblings. Undefined when there is no such element, or a part is empty. (Each part took the
	 * first child that matched any of the three, so a number could match an earlier sibling described with it, and an
	 * empty part ended the path at the element before it.) Consumers' requests, whose paths are numbers, are looked up
	 * by number alone.
	 */
	getElementByPath(path: string, delimiter = '.'): NumberedTreeNode<EmberElement> | undefined {
		const parts = path.split(delimiter)
		const isNumber = (part: string) => /^\d+$/.test(part)
		const numbered = parts.every(isNumber)
		let elements: Children | undefined = this.tree
		let element: NumberedTreeNode<EmberElement> | undefined
		for (const part of parts) {
			if (!elements || part === '') return undefined
			const siblings: Array<NumberedTreeNode<EmberElement>> = [...elements.values()]
			const byNumber = (): NumberedTreeNode<EmberElement> | undefined =>
				isNumber(part) ? siblings.find((e) => e.number === Number(part)) : undefined
			element = numbered
				? byNumber()
				: (siblings.find((e) => 'identifier' in e.contents && e.contents.identifier === part) ??
					siblings.find((e) => 'description' in e.contents && e.contents.description === part) ??
					byNumber())
			if (!element) return undefined
			elements = element.children
		}
		return element
	}

	/**
	 * The element at a consumer's path, by numbers alone: a request's path is a RELATIVE-OID, numbers only, a consumer
	 * turning an identifier path into one itself. It was looked up as getElementByPath does, each part matching a
	 * number, identifier or description, so a request went to an earlier sibling described with the number asked for.
	 */
	private _elementAt(path: string): NumberedTreeNode<EmberElement> | undefined {
		let elements: Children | undefined = this.tree
		let element: NumberedTreeNode<EmberElement> | undefined
		for (const part of path.split('.')) {
			if (!elements || !/^\d+$/.test(part)) return undefined
			const number = Number(part)
			const siblings: Array<NumberedTreeNode<EmberElement>> = [...elements.values()]
			element = siblings.find((e) => e.number === number)
			if (!element) return undefined
			elements = element.children
		}
		return element
	}

	private _subscribe(path: string, client: S101Socket, subscriptions = this._subscriptions) {
		// A Set: a consumer may ask for the same path more than once (a GetDirectory again, or a Subscribe after one),
		// and is sent each change once
		let clients = subscriptions.get(path)
		if (!clients) subscriptions.set(path, (clients = new Set()))
		clients.add(client)
	}
	/** Removes a consumer's subscription to a path, its stream subscription included */
	private _unsubscribe(path: string, client: S101Socket) {
		for (const subscriptions of [this._subscriptions, this._streamSubscriptions]) {
			const clients = subscriptions.get(path)
			if (!clients) continue
			clients.delete(client)
			if (!clients.size) subscriptions.delete(path)
		}
	}
	/** Removes a consumer's subscriptions at a path and below it ('' for the root: all of them) */
	private _unsubscribeBelow(path: string, client: S101Socket) {
		const paths = new Set([...this._subscriptions.keys(), ...this._streamSubscriptions.keys()])
		for (const subscribed of paths) {
			if (path === '' || subscribed === path || subscribed.startsWith(path + '.'))
				this._unsubscribe(subscribed, client)
		}
	}
	private _clearSubscription(client: S101Socket) {
		this._unsubscribeBelow('', client)
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
 * given only when the reply is on the matrix itself (`asked`: the element the GetDirectory is on), the connections as
 * directoryConnections makes them. So a GetDirectory for values only gets each parameter's value, and one for
 * connections on a matrix its identifier, counts and connections. An element without what the mask asks for has no
 * properties, as the DTD says.
 *
 * A template asked about is given whole, whatever the mask: "when a consumer queries a template, the provider must
 * report the entire template structure". (Listed under a node, it is given as the mask asks.)
 */
function directoryContents<T extends EmberElement>(contents: T, mask: FieldFlags, asked: boolean): T {
	if (asked && contents.type === ElementType.Template) return { ...contents }
	const bits = FIELD_MASK_BITS[mask]
	const has = (field: number) => (bits & field) === field
	const copy = { ...contents }
	for (const key of Object.keys(copy)) {
		const field = MASKED_PROPERTIES[key]
		const given = ALWAYS_GIVEN.has(key) || has(field ?? ALL_FIELDS)
		if (!given || WHOLE_MATRIX_PROPERTIES.has(key)) Reflect.deleteProperty(copy, key)
	}
	if (asked && isMatrixContents(contents) && isMatrixContents(copy)) {
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
 * Refuses an update() of a parameter, before any of it is applied, that would leave a value or default the parameter's
 * type doesn't fit (fitsType, as a consumer's setValue is checked): one given that doesn't fit the type, or a type given
 * that the value or default doesn't fit. Such an update was applied, and the encoder refusing the value, the update's
 * notification failed, and so did every later reply giving the parameter.
 *
 * @throws for such an update, or a type that isn't a parameter type
 */
function checkParameterUpdate(parameter: NumberedTreeNode<Parameter>, update: object): void {
	const given = (key: string): unknown =>
		key in update ? Reflect.get(update, key) : Reflect.get(parameter.contents, key)
	const type = given('parameterType')
	const path = getPath(parameter)
	if (!isParameterType(type)) throw new Error(`update: ${String(type)} is not a parameter type, for ${path}`)
	for (const key of ['value', 'defaultValue']) {
		const value = given(key)
		if (value !== undefined && !fitsType(type, value)) {
			const name = key === 'value' ? 'value' : 'default'
			throw new Error(
				`update: a ${name} ${describeValue(value)} doesn't fit parameter ${path} of the type ${type}`
			)
		}
	}
}

/** A value as an error gives it: a string quoted, a number or boolean as it is, anything else by its kind */
function describeValue(value: unknown): string {
	if (typeof value === 'string') return JSON.stringify(value)
	if (typeof value === 'number' || typeof value === 'boolean') return String(value)
	if (value === null) return 'null'
	return Buffer.isBuffer(value) ? 'octets' : typeof value
}

function isParameterType(value: unknown): value is ParameterType {
	return Object.values<unknown>(ParameterType).includes(value)
}

/**
 * The range a parameter's value keeps to: its minimum and maximum when they are numbers (null, or none, being no limit),
 * and whether the range is inverted, the minimum above the maximum, which isn't checked (there is no telling which
 * limit is wrong, and every value would be outside it). The limits are in the value's own unit: "All properties have
 * to be reported in the same unit", a factor or a formula applying to them as to the value.
 */
function valueRange(parameter: Parameter): { minimum?: number; maximum?: number; inverted: boolean } {
	const minimum = typeof parameter.minimum === 'number' ? parameter.minimum : undefined
	const maximum = typeof parameter.maximum === 'number' ? parameter.maximum : undefined
	const inverted = minimum !== undefined && maximum !== undefined && minimum > maximum
	return { minimum, maximum, inverted }
}

/**
 * What makes a numeric value one a parameter doesn't allow, if anything: below its minimum ("the smallest value
 * allowed"), above its maximum ("the largest value allowed"), or, for an enumeration with entries, none of them (a
 * hidden entry being one). An inverted range isn't checked; a value that isn't a number (null, say) is never outside.
 */
function valueProblem(parameter: Parameter, value: unknown): string | undefined {
	if (typeof value !== 'number') return undefined
	if (parameter.parameterType === ParameterType.Enum) {
		const entries = enumEntries(parameter)
		if (entries.length && !entries.some((entry) => entry.value === value))
			return `${value} isn't one of its entries`
	}
	const { minimum, maximum, inverted } = valueRange(parameter)
	if (inverted) return undefined
	if (minimum !== undefined && value < minimum) return `${value} is below its minimum, ${minimum}`
	if (maximum !== undefined && value > maximum) return `${value} is above its maximum, ${maximum}`
	return undefined
}

/**
 * Whether a consumer's value fits a type: as isValueOfType has it, and for an integer or an enumeration a whole number
 * (the encoder writing an integer drops a fraction, and refuses NaN and Infinity)
 */
function fitsType(type: ParameterType, value: unknown): boolean {
	if (!isValueOfType(type, value)) return false
	const wholeOnly = type === ParameterType.Integer || type === ParameterType.Enum
	return !(wholeOnly && typeof value === 'number' && !Number.isInteger(value))
}

/**
 * What is wrong with the arguments of a consumer's Invoke, by the function's description of them ("The values of the
 * arguments as described in Function.arguments"), if anything: another number of them, or one that doesn't fit its
 * type. Nothing for a function that describes none, there being nothing to check them by.
 */
function argumentsProblem(fn: EmberFunction, args: Array<EmberTypedValue>): string | undefined {
	if (!fn.args) return undefined
	if (args.length !== fn.args.length) {
		return `${args.length} ${args.length === 1 ? 'argument' : 'arguments'} given, ${fn.args.length} described`
	}
	for (const [i, described] of fn.args.entries()) {
		const value = args[i]?.value
		if (!fitsType(described.type, value)) {
			const name = described.name ? ` (${described.name})` : ''
			return `argument ${i + 1}${name}, ${String(value)}, doesn't fit its type, ${described.type}`
		}
	}
	return undefined
}

/** Whether a stream format suits a parameter's type: an integer format an integer or an enumeration, a float a real */
function formatSuits(format: StreamFormat, type: ParameterType): boolean {
	if (format.startsWith('Float')) return type === ParameterType.Real
	return type === ParameterType.Integer || type === ParameterType.Enum
}

/** Whether a stream identifier makes a parameter a stream parameter: it "must not be negative" */
function isStreamIdentifier(streamIdentifier: number): boolean {
	return Number.isInteger(streamIdentifier) && streamIdentifier >= 0
}

/** A failure as a warning: an Error as it is, anything else as the message of one */
function normalizeWarning(e: unknown): Error {
	return e instanceof Error ? e : new Error(String(e))
}

/**
 * How a stream value is written into a stream's octets in each of the DTD's stream formats, as the client's
 * StreamManager reads it: an integer format takes the value rounded, and a value out of its range throws (RangeError)
 */
const STREAM_FORMATS: Record<
	StreamFormat,
	{ size: number; write: (octets: Buffer, value: number, offset: number) => void }
> = {
	[StreamFormat.UInt8]: { size: 1, write: (o, v, at) => o.writeUInt8(Math.round(v), at) },
	[StreamFormat.UInt16BE]: { size: 2, write: (o, v, at) => o.writeUInt16BE(Math.round(v), at) },
	[StreamFormat.UInt16LE]: { size: 2, write: (o, v, at) => o.writeUInt16LE(Math.round(v), at) },
	[StreamFormat.UInt32BE]: { size: 4, write: (o, v, at) => o.writeUInt32BE(Math.round(v), at) },
	[StreamFormat.UInt32LE]: { size: 4, write: (o, v, at) => o.writeUInt32LE(Math.round(v), at) },
	[StreamFormat.UInt64BE]: { size: 8, write: (o, v, at) => o.writeBigUInt64BE(BigInt(Math.round(v)), at) },
	[StreamFormat.UInt64LE]: { size: 8, write: (o, v, at) => o.writeBigUInt64LE(BigInt(Math.round(v)), at) },
	[StreamFormat.Int8]: { size: 1, write: (o, v, at) => o.writeInt8(Math.round(v), at) },
	[StreamFormat.Int16BE]: { size: 2, write: (o, v, at) => o.writeInt16BE(Math.round(v), at) },
	[StreamFormat.Int16LE]: { size: 2, write: (o, v, at) => o.writeInt16LE(Math.round(v), at) },
	[StreamFormat.Int32BE]: { size: 4, write: (o, v, at) => o.writeInt32BE(Math.round(v), at) },
	[StreamFormat.Int32LE]: { size: 4, write: (o, v, at) => o.writeInt32LE(Math.round(v), at) },
	[StreamFormat.Int64BE]: { size: 8, write: (o, v, at) => o.writeBigInt64BE(BigInt(Math.round(v)), at) },
	[StreamFormat.Int64LE]: { size: 8, write: (o, v, at) => o.writeBigInt64LE(BigInt(Math.round(v)), at) },
	[StreamFormat.Float32BE]: { size: 4, write: (o, v, at) => o.writeFloatBE(v, at) },
	[StreamFormat.Float32LE]: { size: 4, write: (o, v, at) => o.writeFloatLE(v, at) },
	[StreamFormat.Float64BE]: { size: 8, write: (o, v, at) => o.writeDoubleBE(v, at) },
	[StreamFormat.Float64LE]: { size: 8, write: (o, v, at) => o.writeDoubleLE(v, at) },
}

/** An element of a tree, as elementsOf finds it */
interface FoundElement {
	path: RelativeOID
	element: NumberedTreeNode<EmberElement>
	/** Whether it is a template, or in a template's definition */
	inTemplate: boolean
	/** The collection it is in: none for the element a template defines */
	siblings: Children | undefined
}

/**
 * Every element of a tree: the elements below each one, and the element a template defines (which has the template's
 * path: "The number of a template is the number of its contained element definition"), and those below it
 */
function* elementsOf(elements: Children, parent: RelativeOID = '', inTemplate = false): Generator<FoundElement> {
	for (const element of elements.values()) {
		const path = childPath(parent, element.number)
		const isTemplate = element.contents.type === ElementType.Template
		yield { path, element, inTemplate: inTemplate || isTemplate, siblings: elements }
		if (element.children) yield* elementsOf(element.children, path, inTemplate)
		if (element.contents.type === ElementType.Template && element.contents.element) {
			const templated = element.contents.element
			yield { path, element: templated, inTemplate: true, siblings: undefined }
			if (templated.children) yield* elementsOf(templated.children, path, true)
		}
	}
}

/**
 * An identifier as the specification allows it ("must not contain the character "/" … and must begin with a letter or
 * the lower line character"): each "/" replaced by "_", and "_" put before one that doesn't begin with a letter or "_"
 * (an empty one is "_"). Replaced rather than removed, so nothing of it is lost: "1/2" is "_1_2".
 */
function legalIdentifier(identifier: string): string {
	const replaced = identifier.replaceAll('/', '_')
	return /^[A-Za-z_]/.test(replaced) ? replaced : `_${replaced}`
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
