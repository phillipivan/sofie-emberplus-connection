process.env.DEBUG = 'emberplus-connection:*'
const { EmberClient } = require('../dist/index')

//-------------------------------------------------------------------------
// Client
// ------------------------------------------------------------------------

const client2 = new EmberClient('192.168.1.67', 9000)

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

			const path_1 = 'Channels.Inputs._1.Fader'
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

			// This debug show the fail in the getElementByPath:
			const path2 = 'Channels.Groups._1'
			console.log(' Getting node 1 :', path2)
			client2
				.getElementByPath(path2)
				.then((node) => {
					if (!node) {
						throw new Error(' Could not find node')
					}
					console.log('Found node number:', node.number, 'for Path', path2)
				})
				.catch((error) => {
					console.error('Path', path2, 'Error:', error)
				})
			const path3 = 'Channels.Inputs'
			console.log(' Getting node :', path3)
			client2
				.getElementByPath(path3)
				.then((node) => {
					if (!node) {
						throw new Error(' Could not find node')
					}
					console.log('Found node number:', node.number, 'for Path', path3)
				})
				.catch((error) => {
					console.error('Path', path3, 'Error:', error)
				})
			// The last one is resolved as node2
			const path4 = 'Channels.Groups._1.Fader'
			console.log(' Getting node :', path4)
			return client2.getElementByPath(path4)
		})
		.then((node2) => {
			if (!node2) {
				throw new Error('Could not find node2')
			}
			console.log('Found node 2 number:', node2.number)

			// Subscribe to changes
			client2.subscribe(node2, (node) => {
				const value = node.contents.value
				console.log('Node 2 subscription :', value)
			})
		})
		.then(() => {
			console.log('Successfully subscribed to node 2')
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
