import { EmberClient, setDebugLogging } from '../dist/index.js'

// Debug information from the library, to console.log. (A logger can be given instead: setDebugLogging(true, log).)
// Setting the environment variable DEBUG=emberplus-connection:* in the shell does the same; setting it here would not,
// as the library is loaded before this runs.
setDebugLogging(true)

//-------------------------------------------------------------------------
// Client
// log output from lawo_mc2_fader_metering_mock.js
// ------------------------------------------------------------------------

const client = new EmberClient('192.168.1.67', 9000)
let node1InternalNodePath = ''

client.on('disconnected', () => {
	console.error('Client Lost Ember connection')
	client.tree = new Map()
})

// Handle successful connection
client.on('connected', () => {
	console.log('Client Found Ember connection')
	client.tree = new Map()

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
			node1InternalNodePath = client.getInternalNodePath(node1)

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
client.on('streamUpdate', (internalNodePath, value) => {
	if (internalNodePath !== node1InternalNodePath) {
		return
	}
	console.log('Stream Update:', {
		path: internalNodePath,
		value: value,
	})
})

console.log('-----------------------------------------------------------------------------')
console.log('log output from mc2_fader_metering_example.js')
console.log('Connecting to Client...')
client.connect().catch((error) => {
	console.error('Client 2 Error when connecting:', error)
})
