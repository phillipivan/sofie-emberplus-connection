import vm from 'vm'

import * as Ber from '../../../Ber/index.js'
import { at } from '../../../lib/at.js'
import { EmberElement } from '../../../model/EmberElement.js'
import { TreeElement } from '../../../model/Tree.js'
import { RootElement } from '../../../types/types.js'
import { ElementCollectionBERID, NodeBERID, RootBERID, RootElementsBERID, TemplateBERID } from '../constants.js'
import { berDecode } from '../index.js'
import { withTwoByteTags } from './encodingForms.js'
import { toIndefiniteLength } from './indefiniteLength.js'
import { messages } from './messages.js'

// A message from a peer can be anything. Decoding one must end, by returning or by throwing, however it is malformed.
// A decoder that loops forever takes the process down with it (#46), and a synchronous loop ignores the test runner's timeout,
// so each decode runs under vm's timeout, which interrupts running code.
function decodeEnds(message: Buffer): 'returned' | 'threw' | 'did not end' {
	try {
		vm.runInNewContext('decode()', { decode: () => berDecode(message) }, { timeout: 1000 })
		return 'returned'
	} catch (e) {
		// The timeout's error comes from the vm's own context, so it is no instance of this context's Error
		if ((e as { code?: unknown } | null)?.code === 'ERR_SCRIPT_EXECUTION_TIMEOUT') return 'did not end'
		return 'threw'
	}
}

// The same messages, and the same with every tag in the multi-byte form
const allMessages = (): Array<[string, Buffer]> => [
	...messages(),
	...messages().map(([name, message]): [string, Buffer] => [name + ', two-byte tags', withTwoByteTags(message)]),
]

describe('decoding a malformed message ends', () => {
	// The messages themselves decode, so what follows tests the decoders, not the fixtures
	it.each(allMessages())('%s decodes as it is', (_, message) => {
		expect(berDecode(message).errors ?? []).toEqual([])
	})

	// A message that declares more content than it holds: every length the message's own bytes give runs on past its end
	it.each(allMessages())('%s, cut short at any length', (_, message) => {
		const hanging: number[] = []
		for (let length = 0; length < message.length; length++) {
			if (decodeEnds(message.subarray(0, length)) === 'did not end') hanging.push(length)
		}
		expect(hanging).toEqual([])
	})

	// Nor is a message cut short taken for a whole one: it throws, or decodes with errors. A message of indefinite
	// lengths cut short decoded as an empty tree without errors, its blocks read as empty when their end was missing.
	it.each(allMessages())('%s, cut short at any length, is not taken as whole', (_, message) => {
		const takenAsWhole: number[] = []
		for (let length = 0; length < message.length; length++) {
			try {
				if (berDecode(message.subarray(0, length)).errors.length === 0) takenAsWhole.push(length)
			} catch {
				// refused, as it should be
			}
		}
		expect(takenAsWhole).toEqual([])
	})

	// Any one byte wrong: a tag, a length (too long, too short, long form, indefinite) or contents
	it.each(allMessages())('%s, with any one byte changed', (_, message) => {
		const hanging: string[] = []
		for (let i = 0; i < message.length; i++) {
			for (const value of [0x00, 0x01, 0x7f, 0x80, 0x81, 0x84, 0xff, at(message, i) ^ 0x01]) {
				const changed = Buffer.from(message)
				changed[i] = value
				if (decodeEnds(changed) === 'did not end') hanging.push(`byte ${i} = 0x${value.toString(16)}`)
			}
		}
		expect(hanging).toEqual([])
	})

	// The messages from #46, as found
	it.each(['60036b01', '60026b05', '60056b03a001ff'])('%s', (hex) => {
		expect(decodeEnds(Buffer.from(hex, 'hex'))).not.toBe('did not end')
	})

	// A stream entry whose REAL value has the length 84 80 00 03 a0: four length bytes that, read as a signed number,
	// give a negative length
	it('a value whose length bytes start with 0x80', () => {
		expect(
			decodeEnds(
				Buffer.from(
					'602f662da00c650aa003020101a1030201fda00e650ca003020102a1050984800003a00d650ba003020103a10404020102',
					'hex'
				)
			)
		).not.toBe('did not end')
	})
})

// Elements nested deep enough (some thousands of levels) used up the call stack, ending the decoding with a RangeError.
// Real trees are a handful of levels deep: an element more than 64 levels below the root's is skipped, with an error.
describe('decoding elements nested deep', () => {
	/** A root holding a node holding a node, and so on: `levels` nodes, each numbered 1 */
	function nestedNodes(levels: number): Buffer {
		const w = new Ber.Writer()
		let open = 0
		const start = (tag: number) => {
			w.startSequence(tag)
			open++
		}
		start(RootBERID)
		start(RootElementsBERID)
		start(Ber.CONTEXT(0))
		for (let i = 0; i < levels; i++) {
			start(NodeBERID)
			w.startSequence(Ber.CONTEXT(0))
			w.writeInt(1)
			w.endSequence()
			if (i === levels - 1) break
			start(Ber.CONTEXT(2))
			start(ElementCollectionBERID)
			start(Ber.CONTEXT(0))
		}
		for (; open > 0; open--) w.endSequence()
		return w.buffer
	}

	/** A root holding a template whose element is a template, and so on: `levels` templates */
	function nestedTemplates(levels: number): Buffer {
		const w = new Ber.Writer()
		let open = 0
		const start = (tag: number) => {
			w.startSequence(tag)
			open++
		}
		start(RootBERID)
		start(RootElementsBERID)
		start(Ber.CONTEXT(0))
		for (let i = 0; i < levels; i++) {
			start(TemplateBERID)
			w.startSequence(Ber.CONTEXT(0))
			w.writeInt(1)
			w.endSequence()
			if (i === levels - 1) break
			start(Ber.CONTEXT(1))
		}
		for (; open > 0; open--) w.endSequence()
		return w.buffer
	}

	/** How many levels of children below an element */
	function depthBelow(el: TreeElement<EmberElement>): number {
		let depth = 0
		for (let child = el.children?.get(1); child; child = child.children?.get(1)) depth++
		return depth
	}

	const decode = (message: Buffer) => {
		const decoded = berDecode(message)
		return { errors: decoded.errors.map((e) => e.message), root: (decoded.value as Array<RootElement>)[0] }
	}

	test("decodes nodes 64 levels below the root's", () => {
		const { errors, root } = decode(nestedNodes(65))

		expect(errors).toEqual([])
		expect(depthBelow(root as TreeElement<EmberElement>)).toBe(64)
	})

	test.each([
		['definite', (message: Buffer) => message],
		['indefinite', toIndefiniteLength],
	])('skips a node deeper, with an error (%s lengths)', (_, form) => {
		const { errors, root } = decode(form(nestedNodes(66)))

		expect(errors).toEqual(['decode children: an element nested more than 64 deep: skipped'])
		expect(depthBelow(root as TreeElement<EmberElement>)).toBe(64)
	})

	test.each([
		['nodes', nestedNodes, 'decode children'],
		['templates', nestedTemplates, 'decode template'],
	])('decodes %s nested thousands deep, skipping the deepest', (_, nested, where) => {
		const { errors } = decode(nested(5000))

		expect(errors).toContain(`${where}: an element nested more than 64 deep: skipped`)
	})
})
