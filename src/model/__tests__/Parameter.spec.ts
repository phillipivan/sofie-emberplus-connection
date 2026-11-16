import { EmberValue } from '../../types/types.js'
import { fitsItsType, isValueOfType, Parameter, ParameterImpl, ParameterType } from '../Parameter.js'

describe('isValueOfType', () => {
	test.each<[ParameterType, unknown, boolean]>([
		[ParameterType.Integer, 5, true],
		[ParameterType.Integer, '5', false],
		[ParameterType.Real, 1.5, true],
		[ParameterType.Enum, 2, true],
		[ParameterType.Enum, 'two', false],
		[ParameterType.String, 'go', true],
		[ParameterType.String, 5, false],
		[ParameterType.Boolean, false, true],
		[ParameterType.Boolean, 0, false],
		[ParameterType.Octets, Buffer.from([0xfe]), true],
		[ParameterType.Octets, 'fe', false],
		[ParameterType.Null, null, true],
		[ParameterType.Null, 0, false],
		[ParameterType.Trigger, 'anything', true],
		[ParameterType.Integer, null, true], // a null value, Glow 2.50
	])('a %s parameter takes %j: %s', (type, value, fits) => {
		expect(isValueOfType(type, value)).toBe(fits)
	})
})

describe('fitsItsType', () => {
	const parameter = (type: ParameterType, value?: EmberValue, defaultValue?: EmberValue) => {
		const p = new ParameterImpl(type, 'p', undefined, value)
		p.defaultValue = defaultValue
		return p
	}

	test.each<[string, ParameterImpl, boolean]>([
		['a value and default of the type', parameter(ParameterType.Integer, 5, 0), true],
		['no value or default', parameter(ParameterType.String), true],
		['null values', parameter(ParameterType.Boolean, null, null), true],
		['a value of another type', parameter(ParameterType.String, 5), false],
		['a default of another type', parameter(ParameterType.Integer, 5, 'five'), false],
	])('a parameter with %s: %s', (_, p, fits) => {
		expect(fitsItsType(p)).toBe(fits)
	})

	// A type and a value that are each one of several, as a decoder or a caller that doesn't check types has them
	test('narrows such a parameter to one of a type', () => {
		const narrowed = (type: ParameterType, value: EmberValue): Parameter | undefined => {
			const p = parameter(type, value)
			return fitsItsType(p) ? p : undefined
		}

		expect(narrowed(ParameterType.Integer, 5)).toMatchObject({ parameterType: ParameterType.Integer, value: 5 })
		expect(narrowed(ParameterType.Integer, 'five')).toBeUndefined()
	})
})
