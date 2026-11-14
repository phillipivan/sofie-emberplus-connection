# Ember+ Connection

A TypeScript implementation of [Lawo's Ember+](https://github.com/Lawo/ember-plus) control protocol for _Node_, forked from the library developed for the [**Sofie** TV Automation System](https://github.com/Sofie-Automation/Sofie-TV-automation/).

It has been tested with _Stagetec XACI_, _Stagetec Nexus Compact_, and _DHD XD3_.

The current version is very losely based on the original library and Mr Gilles Dufour's rewrites. It is however rewritten almost completely from scratch and bears little to no resemblance to earlier libraries.

Relative to the official Sofie branch this fork has additional configuration options for the client, updated depencies, and many bug fixes. It it maintained for use by the module for the Companion project. Other users are welcome, but should not expect the formal, process driven approach of the sofie library. _No consideration_ is given regarding the suitability of changes in this fork for any projects other than the one mentioned.

## Changes in this fork

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

---

## Example Usage

### Client

Get Full tree:

```javascript
const { EmberClient, StreamManager } = require('@phillipivan/emberplus-connection')
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
const { EmberClient, EmberLib } = require('@phillipivan/emberplus-connection')

const client = new EmberClient(HOST, PORT)
client
	.connect()
	.then(async () => (await client.getDirectory(client.tree)).response)
	.then(() => {
		console.log(client.tree, null, 4)
	})
	.then(() => client.getElementByPath('scoreMaster/router/labels/group 1'))
	.then((node) => {
		// For streams, use subscribe
		return client.subscribe(node, (update) => {
			console.log(udpate)
		})
	})
	.then(() => client.getElementByPath('0.2'))
	.then(async (node) => {
		// You can get the internal node path, the internal path can be different from the requested,
		// depending on wheter you request a numbered node or via the description
		console.log('This is the internal node path :', client.getInternalNodePath(node))

		// For non-streams a getDirectory will automatically subscribe for update
		return (
			await client.getDirectory(node, (update) => {
				console.log(udpate)
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

### Connection and Reconnecting

`connect()` resolves once connected. Normal connection failures resolve with an `Error`: the provider refuses the connection, or doesn't answer within 5 seconds. Either way the client keeps retrying until it connects, and whenever the connection drops it tries again at once and then the same way, for as long as it is meant to be connected. Retries back off: the first comes 5 seconds after the first attempt, and each one after that waits 5 seconds longer than the one before, up to a minute (attempts at 0, 5, 15, 30, 50 s and so on, once a minute from about 5½ minutes on). Each connection starts the backoff over. `disconnect()` and `discard()` stop the retries, also while an attempt is in progress.

`connect()` doesn't start another attempt while one is under way, or within 5 seconds of the last one: it settles with that attempt, or with the next retry if that attempt has already failed. So it can be called right after the constructor, which starts the first attempt, and a loop that calls `connect()` until it succeeds goes at the pace of the retries. If `disconnect()` or `discard()` comes first, `connect()` resolves with an `Error`.

A provider forgets what a consumer subscribed to when the connection drops. After a reconnect the client asks again for all of it: each `getDirectory()` (including those `getElementByPath()` and `expand()` send) and `subscribe()` that reached the provider, unless unsubscribed since, the root first. The tree loaded so far and the callbacks registered are kept, and the replies update them as usual, so values that changed while disconnected come through. There's no need to look anything up again after a reconnect.

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
client = new EmberClient(LOCALHOST, PORT)
await client.connect()
await (
	await client.getDirectory()
).response
const req = await client.setValue(await client.getElementByPath('0.0.1'), 'gdnet')
await req.response
console.log('result', req.response)
return client.disconnect().then(() => {
	console.log('disconnected')
})
```

### Invoking Function

```javascript
const { EmberClient, EmberLib } = require('node-emberplus')

const client = new EmberClient(HOST, PORT)
await client.connect()
await (
	await client.getDirectory()
).response
const fn = await client.getElementByPath('path.to.function')
const req = await client.invoke(fn, 1, 2, 3)
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

### Basic Server

```javascript
const {
	EmberServer,
	NumberedTreeNodeImpl,
	EmberNodeImpl,
	ParameterImpl,
	ParameterType,
	EmberFunctionImpl,
	ParameterAccess,
	MatrixImpl,
	MatrixType,
	MatrixAddressingMode,
} = require('@phillipivan/emberplus-connection')

const s = new EmberServer(9000) // start server on port 9000

s.onInvocation = (emberFunction, invocation) => {
	// handle function invocations
	return { id: invocation.contents.invocation.id, success: true }
}
s.onSetValue = async (node, value) => {
	// handle setting values
	s.update(node, { value })

	return true
}
s.onMatrixOperation = (matrix, connections) => {
	// handle matrix operations
	for (const connection of Object.values(connections)) {
		s.updateMatrixConnection(matrix, connection)
	}
}

const tree = {
	// create a tree for the provider
	1: new NumberedTreeNodeImpl(1, new EmberNodeImpl('Root', undefined, undefined, true), {
		1: new NumberedTreeNodeImpl(1, new EmberNodeImpl('Node', undefined, undefined, true), {
			1: new NumberedTreeNodeImpl(
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
			2: new NumberedTreeNodeImpl(
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
			3: new NumberedTreeNodeImpl(
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
		}),

		2: new NumberedTreeNodeImpl(2, new EmberNodeImpl('Functions', undefined, undefined, true), {
			1: new NumberedTreeNodeImpl(
				1,
				new EmberFunctionImpl(undefined, undefined) //, [{ type: ParameterType.Boolean, name: 'Test' }])
			),
		}),

		3: new NumberedTreeNodeImpl(3, new EmberNodeImpl('Matrices', undefined, undefined, true), {
			1: new NumberedTreeNodeImpl(
				1,
				new MatrixImpl(
					'Test Matrix',
					[1, 2, 3, 4, 5],
					[1, 2, 3, 4, 5],
					{},
					undefined,
					MatrixType.NToN,
					MatrixAddressingMode.NonLinear,
					5,
					5
				)
			),
		}),
	}),
}

s.init(tree) // initiate the provider with the tree
```

---
