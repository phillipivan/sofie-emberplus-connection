process.env.DEBUG = 'emberplus-connection:S101Codec'
const { EmberClient } = require('../dist/index')

//-------------------------------------------------------------------------
// Client
// ------------------------------------------------------------------------

const client2 = new EmberClient('192.168.1.67', 9998)

client2.on('disconnected', () => {
	console.error('Client 2 Lost Ember connection')
	client2.tree = []
})

// Handle successful connection
client2.on('connected', () => {
	console.log('Client 2 Found Ember connection')
	client2.tree = []

	client2
		.getDirectory(client2.tree)
		.then((req) => {
			console.log(' Req:', req)
			return req.response
		})
		.then(() => {
			console.log(' Getting node...')

			// R3lay PatchBay test path:
			const path_1 = 'R3LAYVirtualPatchBay.Sources.In 1[H:Mikrofon (Volt 276)].PeakValue'
			return client2.getElementByPath(path_1)
		})
		.then((node1) => {
			if (!node1) {
				throw new Error(' Could not find node 1')
			}
			console.log('Found node number:', node1.number)

			// Subscribe to changes
			client2.subscribe(node1, (node1) => {
				const value = node1.contents
				console.log('Node 1 subscription :', value)
			})
		})
		.catch((error) => {
			console.error(' Error:', error)
		})
})
client2.on('streamUpdate', (path, value) => {
	console.log('Stream Update:', {
		path: path,
		value: value,
	})
})

console.log('-----------------------------------------------------------------------------')
console.log('Connecting to Client 2...')
client2.connect().catch((error) => {
	console.error('Client 2 Error when connecting:', error)
})
