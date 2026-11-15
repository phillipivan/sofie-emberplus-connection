import { Reader } from '../../../Ber/Reader.js'
import { Parameter, ParameterType } from '../../../model/Parameter.js'
import { QualifiedElement } from '../../../model/Tree.js'
import { Collection, RootElement } from '../../../types/types.js'
import { berDecode } from '../index.js'
import { withTwoByteTags } from './encodingForms.js'
import { messages } from './messages.js'

// X.690 8.1.2.4: a tag number from 31 up takes the multi-byte form: the first byte's five low bits all set, then the
// number in base 128, bit 8 set on every byte but the last. The Ember+ documentation (Implementation recommendations ›
// Encoder) lets an encoder use that form for any tag, "with the second byte containing the actual tag number", and
// gives a tag's number "up to four bytes". libember reads the form for any number (ber/traits/Tag.hpp).
describe('tags in the multi-byte form', () => {
	// Every message decodes as it does with one-byte tags, with definite lengths in either form and indefinite ones (the
	// messages include both)
	describe.each<[string, (message: Buffer) => Buffer]>([
		['two-byte tags', (m) => withTwoByteTags(m)],
		['two-byte tags and four-byte lengths', (m) => withTwoByteTags(m, { longLengths: true })],
	])('%s', (_, rewrite) => {
		it.each(messages())('%s', (_, message) => {
			const rewritten = rewrite(message)
			expect(rewritten.length).toBeGreaterThan(message.length)

			const decoded = berDecode(rewritten)
			expect(decoded.errors ?? []).toEqual([])
			expect(decoded.value).toEqual(berDecode(message).value)
		})
	})

	/** An element: its tag bytes, the definite length of its contents, its contents */
	const tlv = (tag: number[], ...contents: Buffer[]) => {
		const c = Buffer.concat(contents)
		return Buffer.concat([Buffer.from([...tag, c.length]), c])
	}
	/** An element of indefinite length */
	const indefinite = (tag: number[], ...contents: Buffer[]) =>
		Buffer.concat([Buffer.from([...tag, 0x80]), ...contents, Buffer.from([0, 0])])
	const hex = (s: string) => Buffer.from(s.replace(/ /g, ''), 'hex')

	// The qualified parameter 1, "gain", with the value 5, and between those a field the DTD doesn't have
	function parameterWith(field: Buffer, element = tlv) {
		return element(
			[0x60],
			element(
				[0x6b],
				element(
					[0xa0],
					element(
						[0x69],
						element([0xa0], hex('0d 01 01')),
						element(
							[0xa1],
							element(
								[0x31],
								element([0xa0], hex('0c 04'), Buffer.from('gain')),
								field,
								element([0xa2], hex('02 01 05'))
							)
						)
					)
				)
			)
		)
	}
	const parameter = (message: Buffer) => {
		const decoded = berDecode(message)
		const [element] = Object.values<RootElement>(decoded.value as Collection<RootElement>)
		return {
			element: element as QualifiedElement<Parameter>,
			errors: decoded.errors ?? [],
		}
	}

	// A later DTD may add a field numbered 31 or more: it is skipped as any field this library doesn't know
	it.each<[string, typeof tlv]>([
		['definite', tlv],
		['indefinite', indefinite],
	])('skips a field with the context tag 40, in %s lengths, and reads the others', (_, element) => {
		const { element: decoded, errors } = parameter(parameterWith(element([0xbf, 0x28], hex('02 01 07')), element))

		expect(decoded.path).toBe('1')
		expect(decoded.contents).toMatchObject({ identifier: 'gain', value: 5 })
		expect(errors.map(String)).toEqual([expect.stringMatching(/Unexpected BER context tag/)])
	})

	it('reads a tag number of four bytes', () => {
		// 2^28 - 1 in base 128: ff ff ff 7f
		const { element: decoded, errors } = parameter(
			parameterWith(tlv([0xbf, 0xff, 0xff, 0xff, 0x7f], hex('02 01 07')))
		)

		expect(decoded.contents).toMatchObject({ identifier: 'gain', value: 5 })
		expect(errors).toHaveLength(1)
	})

	it('rejects a tag number that needs more than 32 bits', () => {
		// 2^32 in base 128: 90 80 80 80 00
		expect(() => berDecode(parameterWith(tlv([0xbf, 0x90, 0x80, 0x80, 0x80, 0x00], hex('02 01 07'))))).toThrow(
			/tag number/
		)
	})

	it('rejects a tag whose number runs past the data', () => {
		expect(() => berDecode(hex('60 04 6b 02 bf 81'))).toThrow(/the data ends before its tag does/)
	})

	it('reads a NULL value with a two-byte tag', () => {
		const reader = new Reader(hex('1f 05 00 02 01 07'))

		expect(reader.readValue()).toEqual({ type: ParameterType.Null, value: null })
		expect(reader.readValue()).toEqual({ type: ParameterType.Integer, value: 7 })
	})
})
