import { deviceValue, displayValue, enumEntries } from '../Display.js'
import { FormulaError } from '../Formula.js'
import { Parameter, ParameterImpl, ParameterType } from '../Parameter.js'

/** The parameter given, with the properties given */
function withProperties<P extends Parameter>(contents: P, properties: Partial<Parameter> = {}): P {
	Object.assign(contents, properties)
	return contents
}
const integer = (properties?: Partial<Parameter>) =>
	withProperties(new ParameterImpl(ParameterType.Integer), properties)
const real = (properties?: Partial<Parameter>) => withProperties(new ParameterImpl(ParameterType.Real), properties)
const enumerated = (properties?: Partial<Parameter>) =>
	withProperties(new ParameterImpl(ParameterType.Enum), properties)

describe('enumEntries', () => {
	// "The values must internally be enumerated from 0 to N. If an entry shall not be displayed in a user interface,
	// the entry must begin with '~'."
	test("gives an enumeration's names, numbered from 0, those beginning with ~ hidden", () => {
		expect(enumEntries(enumerated({ enumeration: 'Off\n~Reserved\nOn' }))).toEqual([
			{ value: 0, label: 'Off', hidden: false },
			{ value: 1, label: 'Reserved', hidden: true },
			{ value: 2, label: 'On', hidden: false },
		])
	})

	// For "a device unable to use a consecutive enumeration": its own values, in its order, before the enumeration
	test("gives an enumMap's names and values, in its order, in preference to the enumeration", () => {
		const enumMap = new Map([
			['Low', 10],
			['~Service', 99],
			['High', 20],
		])
		expect(enumEntries(enumerated({ enumMap, enumeration: 'A\nB' }))).toEqual([
			{ value: 10, label: 'Low', hidden: false },
			{ value: 99, label: 'Service', hidden: true },
			{ value: 20, label: 'High', hidden: false },
		])
	})

	test('gives none for a parameter with neither', () => {
		expect(enumEntries(integer())).toEqual([])
		expect(enumEntries(enumerated({ enumeration: '', enumMap: new Map() }))).toEqual([])
	})
})

describe('displayValue', () => {
	// "only the format-characters d, f and x must be used. For example, "%.2f°\ndB" or "%d Units" are valid"
	test.each<[string, number, string]>([
		['%d Units', 5, '5 Units'],
		['%d', -5.7, '-5'],
		['%.2f', 3.14159, '3.14'],
		['%f', 1.5, '1.500000'],
		['%x', 255, 'ff'],
		['%X', 255, 'FF'],
		['%#x', 255, '0xff'],
		['%5d', 42, '   42'],
		['%-5d|', 42, '42   |'],
		['%05.1f', -2.5, '-02.5'],
		['%+d', 3, '+3'],
		['Level: %d%%', 80, 'Level: 80%'],
	])('formats %j with %d as %j', (format, value, text) => {
		expect(displayValue(real({ format }), value).text).toBe(text)
	})

	// "The ° character should be used to indicate where the unit string begins": left out of the text
	test.each<[string, string, string]>([
		['%.2f°dB', '-12.35dB', 'dB'],
		['%.2f° dB', '-12.35 dB', 'dB'],
		['%.2f°\ndB', '-12.35\ndB', 'dB'],
	])('gives the unit after the ° of %j', (format, text, unit) => {
		expect(displayValue(real({ format }), -12.345)).toEqual({ value: -12.345, text, unit })
	})

	// "The consumer then has to divide the reported value when it displays it": %d, and no format, with the decimals the
	// factor gives
	test.each<[Partial<Parameter>, number, string]>([
		[{ factor: 10, format: '%d dB' }, 125, '12.5 dB'],
		[{ factor: 10, format: '%d dB' }, 120, '12.0 dB'],
		[{ factor: 100 }, -1250, '-12.50'],
		[{ factor: 4 }, 5, '1.25'],
		[{ factor: 10, format: '%.2f' }, 125, '12.50'],
	])('divides by the factor of %j', (properties, value, text) => {
		expect(displayValue(integer(properties), value).text).toBe(text)
	})

	test("computes a value by the formula's first expression, with $ as the parameter's type", () => {
		expect(displayValue(integer({ formula: '$ / 2\n$ * 2', format: '%.1f' }), 5)).toEqual({
			value: 2.5,
			text: '2.5',
		})
		expect(displayValue(integer({ formula: '$ \\ 2\n$ * 2' }), 5).value).toBe(2)
		// a formula and a factor "must not" both be given: the formula is used
		expect(displayValue(integer({ formula: '$ * 3', factor: 10 }), 2).value).toBe(6)
	})

	test("gives an enumeration's value as its entry's name, or as the number without one", () => {
		const level = enumerated({ enumeration: 'Off\nLow\nHigh' })
		expect(displayValue(level, 2)).toEqual({ value: 2, text: 'High' })
		expect(displayValue(level, 7)).toEqual({ value: 7, text: '7' })
	})

	test("takes the parameter's own value by default, and its limits as well", () => {
		const gain = integer({ value: 125, maximum: 200, factor: 10 })
		expect(displayValue(gain).text).toBe('12.5')
		expect(displayValue(gain, gain.maximum).text).toBe('20.0')
	})

	test('gives other values as text, and none for no value', () => {
		expect(displayValue(new ParameterImpl(ParameterType.String), 'abc').text).toBe('abc')
		expect(displayValue(new ParameterImpl(ParameterType.Boolean), true).text).toBe('true')
		expect(displayValue(new ParameterImpl(ParameterType.Octets), Buffer.from([1, 255])).text).toBe('01ff')
		expect(displayValue(integer(), null)).toEqual({ value: null, text: '' })
		expect(displayValue(integer())).toEqual({ value: undefined, text: '' })
	})

	test('throws a FormulaError for a formula it cannot read', () => {
		expect(() => displayValue(integer({ formula: 'foo($)' }), 1)).toThrow(FormulaError)
	})
})

describe('deviceValue', () => {
	// "multiply it with this factor when it wants to change the parameter"
	test('multiplies by the factor, rounding for an integer', () => {
		expect(deviceValue(integer({ factor: 10 }), 12.3)).toBe(123)
		expect(deviceValue(integer({ factor: 10 }), 12.34)).toBe(123)
		expect(deviceValue(real({ factor: 10 }), 12.34)).toBeCloseTo(123.4, 12)
	})

	test("computes a value by the formula's second expression", () => {
		expect(deviceValue(real({ formula: '$ / 2\n$ * 2' }), 2.5)).toBe(5)
		expect(deviceValue(integer({ formula: '1 + log($, 2)\n2^($ - 1)' }), 4)).toBe(8)
	})

	test('throws for a formula without a second expression, as for a read-only parameter', () => {
		expect(() => deviceValue(integer({ formula: '$ / 2' }), 1)).toThrow(/has no second expression/)
	})

	test('rounds a value for an integer or an enumeration without a factor or formula', () => {
		expect(deviceValue(integer(), 2.6)).toBe(3)
		expect(deviceValue(enumerated(), 1.2)).toBe(1)
		expect(deviceValue(real(), 2.6)).toBe(2.6)
	})
})
