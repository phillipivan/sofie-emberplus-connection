import vm from 'vm'

import { at } from '../../../lib/at.js'
import { berDecode } from '../index.js'
import { withTwoByteTags } from './encodingForms.js'
import { messages } from './messages.js'

// A message from a peer can be anything. Decoding one must end, by returning or by throwing, however it is malformed.
// A decoder that loops forever takes the process down with it (#46), and a synchronous loop ignores jest's timeout,
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
