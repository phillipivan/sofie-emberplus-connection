import { at } from '../at.js'

describe('at', () => {
	test('gives the element at an index', () => {
		expect(at([4, 5, 6], 1)).toBe(5)
		expect(at(Buffer.from([0xfe, 0x00]), 1)).toBe(0) // a 0 is there
		expect(at({ 3: 'three' }, 3)).toBe('three') // a collection, keyed by number
	})
	test('throws for an index with nothing there', () => {
		expect(() => at(Buffer.from([0xfe]), 1)).toThrow(
			new RangeError('Nothing at 1, outside the 1 elements there are')
		)
		expect(() => at([1, 2], -1)).toThrow(RangeError)
		expect(() => at({ 3: 'three' }, 4)).toThrow(new RangeError('Nothing at 4'))
	})
})
