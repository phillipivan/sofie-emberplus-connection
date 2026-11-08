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

Requests in flight when the connection drops are rejected, and requests made before a reconnect aren't repeated: ask for what you need again once connected.

```javascript
const client = new EmberClient(HOST, PORT)
client.on('connected', async () => {
	// Also fires after every reconnect
	try {
		await (
			await client.getDirectory(client.tree)
		).response
	} catch (e) {
		// e.g. the connection dropped again; the next 'connected' asks again
		console.log('Could not get the tree:', e)
	}
})
client.on('disconnected', () => {
	console.log('Connection lost, reconnecting')
})
await client.connect()
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
