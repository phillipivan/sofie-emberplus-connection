# Ember+ Connection

A TypeScript implementation of [Lawo's Ember+](https://github.com/Lawo/ember-plus) control protocol for _Node_, forked from the library developed for the [**Sofie** TV Automation System](https://github.com/Sofie-Automation/Sofie-TV-automation/).

It has been tested with _Stagetec XACI_, _Stagetec Nexus Compact_, and _DHD XD3_.

The Sofie version was very losely based on the original library and Mr Gilles Dufour's rewrites.

Relative to the Sofie branch this fork has additional configuration options, stronger typings, useful helper functions, updated dependencies, and many bug fixes. Several of these changes are breaking, it is not a drop in replacement for the Sofie Library. It it maintained for use by the module for the Companion project.

## Changes in this fork

The package is an ES module (`"type": "module"`); `require()` of it works too, on the Node versions it needs (26 and later). Import from the package root only: its `exports` map leaves out the files in `dist`, which are not part of the API. Everything a consumer needs is exported from the root, the model's types and classes as `Model` and the protocol's types as `Types`.

### Client

An options object

```typescript
import { EmberClient, EmberClientOptions } from '@phillipivan/emberplus-connection'

const options: EmberClientOptions = {
	timeout: 1000,
	enableResends: false,
	getDirectoryOnParams: false, // Disable if this causes issues with ember+ provider
}

const client = new EmberClient('10.9.8.7', 9000, options)
```

Reconnects back off from 5 seconds to a minute between attempts, see [Connection and Reconnecting](#connection-and-reconnecting).

### Server

An options object, limiting what consumers may cost the provider. Each is optional, with the default shown:

```typescript
import { EmberServer, EmberServerOptions } from '@phillipivan/emberplus-connection'

const options: EmberServerOptions = {
	maxSendBufferSize: 8 * 1024 * 1024,
	maxClients: 64,
	keepalive: true,
}

const server = new EmberServer(9000, undefined, options)
```

- `maxSendBufferSize`: bytes waiting to be sent to a consumer above which its connection is closed, as it isn't reading what is sent to it. The consumer connects again and asks for the tree again. Raise it to send large bursts to consumers on slow links; `Infinity` turns it off.
- `maxClients`: consumers connected at once. A connection beyond it is closed as soon as it is made, and the server emits a `warn` saying so. `Infinity` turns it off.
- `keepalive`: sends each consumer a keep-alive request when nothing has come from it for 5 seconds, and closes its connection when nothing comes in the 5 seconds after, so a consumer gone without closing its connection is noticed in about 10 seconds. Every Ember+ host must answer one; turn this off for a consumer that doesn't. TCP keep-alive is on either way, which notices such a consumer after some minutes.

---

## Example Usage

### Client

Get Full tree:

```javascript
const { EmberClient } = require('@phillipivan/emberplus-connection')
const client = new EmberClient('10.9.8.7', 9000)
client.on('error', (e) => {
	console.log(e)
})
await client.connect()

// If you want to listen to stream updates - you can do it like this:
client.on('streamUpdate', (internalNodePath, value) => {
	console.log('Stream Update:', {
		path: internalNodePath,
		value: value,
	})
	// You can get the internal node path, the internal path can be different from the path you requested,
	// depending on wheter you request a numbered node or via the description
	// the client has a client.getInternalNodePath(node) that you can request and use as reference when subsribing to a node
})

// Get Root info
const req = await client.getDirectory(client.tree)
await req.response
// Get a Specific Node
const node = await client.getElementByPath('0.0.2')
console.log(node)
// Get a node by its path identifiers
const node2 = await client.getElementByPath('path.to.node')
console.log(node2)
// Get a node by its path descriptions
const node3 = await client.getElementByPath('descr1.descr2.descr3')
console.log(node3)
// Expand entire tree under node 0
await client.expand(client.tree)
console.log(client.tree)
```

A path of numbers only, like `0.0.2`, is matched by the elements' numbers alone. In any other path each part is matched to an identifier, or else a description, or else a number, so `path.to.2` mixes them. Both forms resolve to the same element, and callbacks registered through either are called for its changes.

Subsribe to changes

```javascript
const { EmberClient } = require('@phillipivan/emberplus-connection')

const client = new EmberClient(HOST, PORT)
client
	.connect()
	.then(async () => (await client.getDirectory(client.tree)).response)
	.then(() => {
		console.log(client.tree)
	})
	// A path given by "/" needs it as the delimiter (the third argument; the second is a callback)
	.then(() => client.getElementByPath('scoreMaster/router/labels/group 1', undefined, '/'))
	.then((node) => {
		// For streams, use subscribe: the callback is called with the parameter each time a stream value arrives
		return client.subscribe(node, (update) => {
			console.log(update.contents.value)
		})
	})
	.then(() => client.getElementByPath('0.2'))
	.then(async (node) => {
		// You can get the internal node path, the internal path can be different from the requested,
		// depending on wheter you request a numbered node or via the description
		console.log('This is the internal node path :', client.getInternalNodePath(node))

		// For non-streams a getDirectory will automatically subscribe for update. The callback is the third argument:
		// the second is the field mask (none: all of the properties)
		return (
			await client.getDirectory(node, undefined, (update) => {
				console.log(update)
			})
		).response
	})
	// You can also provide a callback to the getElementByPath
	// Be carefull that subscription will be done for all elements in the path
	.then(() =>
		client.getElementByPath('0.3', (update) => {
			console.log(update)
		})
	)
client.on('streamUpdate', (internalNodePath, value) => {
	console.log('Stream Update:', {
		path: internalNodePath,
		value: value,
	})
})
```

### Following every change

The `change` event gives every change a message from the provider made to the client's tree, without a callback for each element. It comes once per message that changed anything, after the tree has the changes, with them in the order the message gave them:

```javascript
const { EmberClient, TreeChangeKind } = require('@phillipivan/emberplus-connection')

client.on('change', (changes) => {
	for (const change of changes) {
		switch (change.kind) {
			case TreeChangeKind.Updated:
				// change.changed: the properties that got a different value; change.previous: the values they had
				if (change.changed.includes('value')) {
					console.log(change.path, change.previous.value, '->', change.element.contents.value)
				}
				break
			case TreeChangeKind.Added:
				// an element the tree didn't have; each element below it is a change of its own
				break
			case TreeChangeKind.OutsideTree:
				// an element below one the tree hasn't loaded, as the provider reported it
				break
		}
	}
})
```

A property sent again with the value it had isn't a change, so a GetDirectory's reply, which sends every property again, gives none for what is already known. An object, such as an `enumMap` or a matrix's `labels`, is compared by what it holds. The nodes a nested report passes through aren't changes either. The event reports only what the provider sends: a GetDirectory on a node is what asks it to send the changes to that node's children. Stream values come with `streamUpdate` instead.

### Connection and Reconnecting

`connect()` resolves once connected. Normal connection failures resolve with an `Error`: the provider refuses the connection, or doesn't answer within 5 seconds. Either way the client keeps retrying until it connects, and whenever the connection drops it tries again at once and then the same way, for as long as it is meant to be connected. Retries back off: the first comes 5 seconds after the first attempt, and each one after that waits 5 seconds longer than the one before, up to a minute (attempts at 0, 5, 15, 30, 50 s and so on, once a minute from about 5½ minutes on). Each connection starts the backoff over. `disconnect()` and `discard()` stop the retries, also while an attempt is in progress.

`connect()` doesn't start another attempt while one is under way, or within 5 seconds of the last one: it settles with that attempt, or with the next retry if that attempt has already failed. So it can be called right after the constructor, which starts the first attempt, and a loop that calls `connect()` until it succeeds goes at the pace of the retries. If `disconnect()` or `discard()` comes first, `connect()` resolves with an `Error`.

A provider forgets what a consumer subscribed to when the connection drops. After a reconnect the client asks again for all of it: each `getDirectory()` (including those `getElementByPath()` and `expand()` send) and `subscribe()` that reached the provider, unless unsubscribed since, the root first. (Unsubscribing from a node also covers the parameters directly below it, as it does for the provider.) The tree loaded so far and the callbacks registered are kept, and the replies update them as usual, so values that changed while disconnected come through. There's no need to look anything up again after a reconnect.

Requests in flight when the connection drops are rejected, and others, such as `setValue()` or `invoke()`, aren't repeated.

```javascript
const client = new EmberClient(HOST, PORT)
client.on('disconnected', () => {
	console.log('Connection lost, reconnecting')
})
client.on('connected', () => {
	// Also fires after every reconnect, once the subscriptions have been asked for again
	console.log('Connected')
})
await client.connect()
await client.getElementByPath('1.2.3', (node) => {
	// Called with each change the provider reports, also after a reconnect
	console.log('Changed:', node)
})
```

### Setting New Value

```javascript
const client = new EmberClient(LOCALHOST, PORT)
await client.connect()
await (
	await client.getDirectory(client.tree)
).response
const req = await client.setValue(await client.getElementByPath('0.0.1'), 'gdnet')
console.log('result', await req.response)
await client.disconnect()
console.log('disconnected')
```

### Displaying Values

A parameter's `format`, `factor`, `formula` and enumeration describe how its value is shown. `Model.displayValue`
applies them: the formula's first expression or the factor, then the format (with a factor, `%d` keeps the factor's
decimals), giving the text and the unit (the part of the format after its `°`). `Model.deviceValue` turns a value
entered back into the device's, for `setValue`. `Model.enumEntries` gives an enumeration's entries, from its `enumMap`
or its `enumeration`, with those beginning with `~` marked hidden. `Model.parseFormula` parses a formula on its own.

```javascript
const { Model } = require('@phillipivan/emberplus-connection')

const gain = await client.getElementByPath('path.to.gain') // format "%d°dB", factor 10, value -125
const { text, unit } = Model.displayValue(gain.contents) // text "-12.5dB", unit "dB"
await client.setValue(gain, Model.deviceValue(gain.contents, -6)) // sends -60

const mode = await client.getElementByPath('path.to.mode') // enumeration "Off\n~Test\nOn"
const choices = Model.enumEntries(mode.contents).filter((entry) => !entry.hidden) // Off (0) and On (2)
```

### Invoking Function

```javascript
const { EmberClient, Model } = require('@phillipivan/emberplus-connection')

const client = new EmberClient(HOST, PORT)
await client.connect()
await (
	await client.getDirectory(client.tree)
).response
const fn = await client.getElementByPath('path.to.function')
// The arguments are typed values, as the function's arguments describe them
const integer = (value) => ({ type: Model.ParameterType.Integer, value })
const req = await client.invoke(fn, integer(1), integer(2), integer(3))
console.log('result', await req.response)
```

### Changing Matrix Connections

```javascript
const client = new EmberClient(HOST, PORT)
await client.connect()
await (
	await client.getDirectory(client.tree)
).response
const matrix = await client.getElementByPath('path.to.matrix')
// connect source 3 to target 2, in addition to the sources already connected to it
const req = await client.matrixConnect(matrix, 2, [3])
try {
	await req.response
} catch (e) {
	// e.g. "Matrix 1.2.1: target 2 is locked", or the provider didn't answer in time
	console.log('Could not connect:', e)
}
```

`matrixDisconnect()` removes sources from a target, and `matrixSetConnection()` replaces a target's sources with the ones given. The response resolves, with the matrix, once the provider reports the connection of the target asked for. Reports on the matrix's other targets, which may arrive in between, are applied to the tree but don't settle it. It rejects if the provider reports the target as locked. If the provider reports the connection as pending, it has queued the request: the response resolves, and the tree changes when the provider reports the connection as made.

Once a matrix's connections are loaded, with a `getDirectory()` on the matrix, `matrix.contents.connections.get(target)` holds the target's current sources and the disposition the provider last reported for it. So after a request has resolved, `disposition` tells whether the change is made or only queued:

```javascript
const { Model } = require('@phillipivan/emberplus-connection')

await (
	await client.getDirectory(matrix)
).response
await (
	await client.matrixConnect(matrix, 2, [3])
).response
if (matrix.contents.connections.get(2)?.disposition === Model.ConnectionDisposition.Pending) {
	console.log('Queued: target 2 still has', matrix.contents.connections.get(2).sources)
}
```

### Basic Server

```javascript
const { EmberServer, Model } = require('@phillipivan/emberplus-connection')
const {
	NumberedTreeNodeImpl,
	EmberNodeImpl,
	ParameterImpl,
	ParameterType,
	EmberFunctionImpl,
	ParameterAccess,
	MatrixImpl,
	MatrixType,
	MatrixAddressingMode,
	signalsOf,
	childrenOf,
} = Model

const s = new EmberServer(9000) // start server on port 9000

s.onInvocation = async (emberFunction, invocation) => {
	// handle function invocations
	return { id: invocation.contents.invocation.id, success: true }
}
s.onSetValue = async (node, value, client) => {
	// handle setting values. Each handler is also given the consumer that asked: client.remoteAddress and
	// client.remotePort say where from, for logging or permissions by consumer
	s.update(node, { value })

	return true
}
s.onMatrixOperation = async (matrix, connections) => {
	// handle matrix operations. updateMatrixConnection applies a change by the matrix's type (and, n-to-n, its
	// maximumConnectsPerTarget and maximumTotalConnects: it returns false when it refuses one) and reports it. The
	// consumer that asked is always answered, with the target's current state when nothing changed.
	for (const connection of connections.values()) {
		s.updateMatrixConnection(matrix, connection)
	}
}

// create a tree for the provider: childrenOf keeps each element under its own number
const tree = childrenOf([
	new NumberedTreeNodeImpl(
		1,
		new EmberNodeImpl('Root', undefined, undefined, true),
		childrenOf([
			new NumberedTreeNodeImpl(
				1,
				new EmberNodeImpl('Node', undefined, undefined, true),
				childrenOf([
					new NumberedTreeNodeImpl(
						1,
						new ParameterImpl(
							ParameterType.Integer,
							'Value1',
							undefined,
							2,
							undefined,
							undefined,
							ParameterAccess.ReadWrite
						)
					),
					new NumberedTreeNodeImpl(
						2,
						new ParameterImpl(
							ParameterType.Integer,
							'Value2',
							undefined,
							2,
							undefined,
							undefined,
							ParameterAccess.ReadWrite
						)
					),
					new NumberedTreeNodeImpl(
						3,
						new ParameterImpl(
							ParameterType.Integer,
							'Value3',
							undefined,
							2,
							undefined,
							undefined,
							ParameterAccess.ReadWrite
						)
					),
				])
			),
			new NumberedTreeNodeImpl(
				2,
				new EmberNodeImpl('Functions', undefined, undefined, true),
				childrenOf([
					new NumberedTreeNodeImpl(
						1,
						new EmberFunctionImpl(undefined, undefined) //, [{ type: ParameterType.Boolean, name: 'Test' }])
					),
				])
			),
			new NumberedTreeNodeImpl(
				3,
				new EmberNodeImpl('Matrices', undefined, undefined, true),
				childrenOf([
					new NumberedTreeNodeImpl(
						1,
						new MatrixImpl(
							'Test Matrix',
							signalsOf([1, 2, 3, 4, 5]),
							signalsOf([1, 2, 3, 4, 5]),
							new Map(),
							undefined,
							MatrixType.NToN,
							MatrixAddressingMode.NonLinear,
							5,
							5
						)
					),
				])
			),
		])
	),
])

await s.init(tree) // initiate the provider with the tree
```

A matrix connection report tells consumers what happened to each target by its disposition. `updateMatrixConnection`
reports a change as _modified_, and a change that leaves the target as it was, or that it refuses, as _tally_ (the
current state). Two more are the provider's to give:

```javascript
const matrix = tree.get(1).children.get(3).children.get(1)

// Locked: consumers' requests on target 2 are answered with its current sources as "locked", and onMatrixOperation
// isn't called for them. A handler that finds a target locked can lock it before returning, with the same answer.
// The provider's own updateMatrixConnection still changes a locked target.
s.setMatrixTargetLocked(matrix, 2)
s.setMatrixTargetLocked(matrix, 2, false) // unlock

// Pending: a change the device makes later. queueMatrixConnection reports the sources the target will have as
// "pending", changing nothing; updateMatrixConnection reports the change as modified once it is made. (If it never
// is, report the target as it is: updateMatrixConnection with its current sources reports it as tally.)
// device.route stands for the device's own API.
s.onMatrixOperation = async (matrix, connections) => {
	for (const connection of connections.values()) {
		s.queueMatrixConnection(matrix, connection)
		device.route(connection).then(() => s.updateMatrixConnection(matrix, connection))
	}
}
```

A parameter with a `streamIdentifier` (not negative) is a stream parameter, such as an audio meter. `update()` sends its
value only to the consumers that sent a Subscribe for it, in a stream collection, not as a change notification; values
changed at once go out together. Several parameters can share a stream, packed into one octet string, each by its
`streamDescriptor` (format and offset). The specification recommends sending stream values every 50 to 80 ms.

```javascript
const { Model } = require('@phillipivan/emberplus-connection')

const left = new Model.ParameterImpl(Model.ParameterType.Integer, 'left', undefined, 0)
left.streamIdentifier = 1
left.streamDescriptor = { format: Model.StreamFormat.Int16LE, offset: 0 }
const right = new Model.ParameterImpl(Model.ParameterType.Integer, 'right', undefined, 0)
right.streamIdentifier = 1
right.streamDescriptor = { format: Model.StreamFormat.Int16LE, offset: 2 }
// ... in the tree, as left and right below a meters node; then, every 50 ms:
s.update(leftNode, { value: meters.left })
s.update(rightNode, { value: meters.right }) // both in one stream collection
```

---
