//process.env.DEBUG = 'emberplus-connection:*'
const { EmberClient } = require('../dist/index')

//-------------------------------------------------------------------------
// Client
// log output from mc2_1_fader_mock.js
// ------------------------------------------------------------------------

const client = new EmberClient('192.168.1.67', 9000)

client.on('disconnected', () => {
	console.error('Client Lost Ember connection')
	client.tree = []
})

// Handle successful connection
client.on('connected', () => {
	console.log('Client Found Ember connection')
	client.tree = []

	client
		.getDirectory(client.tree)
		.then((req) => {
			console.log(' Req:', req)
			return req.response
		})
		.then(() => {
			console.log(' Getting node...')

			const path_1 = 'Channels.Inputs._1.Metering.Main Level'
			return client.getElementByPath(path_1)
		})
		.then((node1) => {
			if (!node1) {
				throw new Error(' Could not find node 1')
			}
			console.log('Found node:', node1)

			// Subscribe to changes
			client.subscribe(node1, (node1) => {
				const value = node1.contents
				console.log('Node 1 subscription :', value)
			})
		})
		.catch((error) => {
			console.error(' Error:', error)
		})
})
client.on('streamUpdate', (path, value) => {
	console.log('Stream Update:', {
		path: path,
		value: value,
	})
})

console.log('-----------------------------------------------------------------------------')
console.log('log output from mc2_1_fader_mock.js')
console.log('Connecting to Client...')
client.connect().catch((error) => {
	console.error('Client 2 Error when connecting:', error)
})
