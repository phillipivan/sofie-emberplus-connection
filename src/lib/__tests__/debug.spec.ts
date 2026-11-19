import Debug from 'debug'

import { makeDebug, setDebugLogging } from '../debug.js'

describe('setDebugLogging', () => {
	let before: string
	beforeEach(() => {
		before = Debug.disable()
	})
	afterEach(() => {
		setDebugLogging(false) // back to console.log
		Debug.enable(before)
	})

	it('turns the library logging on and off, after the library is loaded', () => {
		const log = vi.fn()
		const debug = makeDebug('S101Codec')

		debug('before')
		setDebugLogging(true, log)
		debug('on %d', 1)
		setDebugLogging(false, log)
		debug('off')

		expect(log).toHaveBeenCalledTimes(1)
		expect(log.mock.calls[0]).toEqual([expect.stringMatching(/emberplus-connection:S101Codec on 1/)])
	})

	it('writes to console.log when given no log', () => {
		const spy = vi.spyOn(console, 'log').mockImplementation(() => undefined)
		try {
			setDebugLogging(true)
			makeDebug('S101Client')('to the console')

			expect(spy).toHaveBeenCalledWith(expect.stringMatching(/emberplus-connection:S101Client to the console/))
		} finally {
			spy.mockRestore()
		}
	})

	it('keeps the other namespaces enabled', () => {
		Debug.enable('other:*,-noisy:*')

		setDebugLogging(true)
		expect([Debug.enabled('other:x'), Debug.enabled('noisy:x'), Debug.enabled('emberplus-connection:x')]).toEqual([
			true,
			false,
			true,
		])
		setDebugLogging(false)
		expect([Debug.enabled('other:x'), Debug.enabled('noisy:x'), Debug.enabled('emberplus-connection:x')]).toEqual([
			true,
			false,
			false,
		])
	})

	it('turns it off even when every namespace is enabled', () => {
		Debug.enable('*')

		setDebugLogging(false)

		expect(Debug.enabled('emberplus-connection:S101Client')).toBe(false)
		expect(Debug.enabled('other:x')).toBe(true)
	})

	it("replaces the library's earlier namespaces, rather than adding to them", () => {
		Debug.enable('emberplus-connection:S101Codec,other:*')

		setDebugLogging(true)
		setDebugLogging(false)
		setDebugLogging(true)

		expect(Debug.disable()).toBe('other:*,emberplus-connection:*')
	})
})
