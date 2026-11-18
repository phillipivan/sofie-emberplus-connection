import { EmberNodeImpl } from '../EmberNode.js'
import { childrenOf, NumberedTreeNodeImpl } from '../Tree.js'

describe('childrenOf', () => {
	// Children were an object by number, which could file a child under another number than its own
	test('keeps each element under its own number, the later of two with one number', () => {
		const first = new NumberedTreeNodeImpl(2, new EmberNodeImpl('first'))
		const later = new NumberedTreeNodeImpl(2, new EmberNodeImpl('later'))
		const other = new NumberedTreeNodeImpl(7, new EmberNodeImpl('other'))

		expect([...childrenOf([first, other, later]).entries()]).toEqual([
			[2, later],
			[7, other],
		])
	})
})
