import { EmberValue } from '../types/types.js'
import { FormulaError, parseFormula } from './Formula.js'
import { Parameter, ParameterType } from './Parameter.js'

export { DisplayValue, EnumEntry, deviceValue, displayValue, enumEntries }

/** An entry of a parameter's enumeration */
interface EnumEntry {
	/** The parameter's value for the entry */
	value: number
	/** The entry's name, without the "~" that hides it */
	label: string
	/** Whether the entry is one that "shall not be displayed in a user interface": its name began with "~" */
	hidden: boolean
}

/** A parameter's value as it is to be displayed */
interface DisplayValue {
	/** The value, by the parameter's formula or factor (an enumeration's: the entry's number) */
	value: EmberValue | undefined
	/** The value as text: by the parameter's format, or an enumeration's entry name; '' for none, or null */
	text: string
	/** The unit, the part of the format after its "°" (which marks where the unit begins), when it has one */
	unit?: string
}

/**
 * A parameter's enumeration as entries, in their order: its `enumMap` when it has one, the name and value pairs of a
 * device "unable to use a consecutive enumeration", or else its `enumeration`, names separated by line feeds and
 * numbered from 0. An entry whose name begins with "~" "shall not be displayed in a user interface": it is marked
 * hidden, its label without the "~" (as the specification says for `enumeration`, and taken the same way for `enumMap`).
 * Empty for a parameter with neither.
 */
function enumEntries(parameter: Parameter): EnumEntry[] {
	const entry = (name: string, value: number): EnumEntry =>
		name.startsWith('~') ? { value, label: name.slice(1), hidden: true } : { value, label: name, hidden: false }
	if (parameter.enumMap?.size) return [...parameter.enumMap].map(([name, value]) => entry(name, value))
	if (!parameter.enumeration) return []
	return parameter.enumeration.split('\n').map((name, index) => entry(name, index))
}

/**
 * A parameter's value (by default its current one; its minimum, maximum or default work as well) as it is to be
 * displayed:
 *
 * - a number is computed by the parameter's formula (its first expression: provider to consumer), or else divided by its
 *   factor ("The consumer then has to divide the reported value when it displays it"), and given as text by its format,
 *   a C-style format string of `%d`, `%f` or `%x` ("%.2f°dB", "%d Units"). With a factor, `%d` and a value without a
 *   format show the decimals the factor gives (a factor of 10, one), so that the factored value isn't cut short. The
 *   "°" that marks where the unit begins is left out of the text, and what follows it is the unit.
 * - an enumeration's value is given as the name of its entry (enumEntries), or as the number when it has none
 * - a string as it is, a boolean as `true` or `false`, octets in hexadecimal
 *
 * A formula and a factor "must not" both be given: a formula is used when there is one.
 *
 * @throws FormulaError for a formula that can't be parsed or computed
 */
function displayValue(parameter: Parameter, value: EmberValue | undefined = parameter.value): DisplayValue {
	if (value === undefined || value === null) return { value, text: '' }
	if (parameter.parameterType === ParameterType.Enum && typeof value === 'number') {
		const label = enumEntries(parameter).find((entry) => entry.value === value)?.label
		return { value, text: label ?? String(value) }
	}
	if (typeof value === 'boolean') return { value, text: String(value) }
	if (typeof value === 'string') return { value, text: value }
	if (Buffer.isBuffer(value)) return { value, text: value.toString('hex') }

	let displayed = value
	let decimals: number | undefined
	if (parameter.formula) {
		const input = parameter.parameterType === ParameterType.Integer ? 'integer' : 'real'
		displayed = parseFormula(parameter.formula).toDisplay(value, input)
	} else if (isFactor(parameter.factor)) {
		displayed = value / parameter.factor
		decimals = factorDecimals(parameter.factor)
	}

	if (!parameter.format) {
		return { value: displayed, text: decimals === undefined ? String(displayed) : displayed.toFixed(decimals) }
	}
	const marker = parameter.format.indexOf('°')
	const numberPart = marker < 0 ? parameter.format : parameter.format.slice(0, marker)
	const unitPart = marker < 0 ? '' : parameter.format.slice(marker + 1)
	const text = formatNumber(numberPart, displayed, decimals) + unitPart.replaceAll('%%', '%')
	const unit = marker < 0 ? undefined : unitPart.replaceAll('%%', '%').trim()
	return unit === undefined ? { value: displayed, text } : { value: displayed, text, unit }
}

/**
 * The device value for a value entered for a parameter, for setValue: computed by the parameter's formula (its second
 * expression: consumer to provider), or else multiplied by its factor ("multiply it with this factor when it wants to
 * change the parameter"). For an integer or an enumeration, rounded to a whole number.
 *
 * @throws FormulaError for a formula that can't be parsed or computed, or that has no second expression (as for a
 * read-only parameter, which needs none)
 */
function deviceValue(parameter: Parameter, displayed: number): number {
	let value = displayed
	if (parameter.formula) {
		const { toDevice } = parseFormula(parameter.formula)
		if (!toDevice) throw new FormulaError(`The formula "${parameter.formula}" has no second expression`)
		value = toDevice(displayed, 'real')
	} else if (isFactor(parameter.factor)) {
		value = displayed * parameter.factor
	}
	const wholeOnly =
		parameter.parameterType === ParameterType.Integer || parameter.parameterType === ParameterType.Enum
	return wholeOnly ? Math.round(value) : value
}

/** Whether a factor is one that changes the value: a whole number other than 0 and 1 */
function isFactor(factor: number | undefined): factor is number {
	return factor !== undefined && Number.isInteger(factor) && factor !== 0 && factor !== 1
}

/** The decimals a value divided by a factor needs: as many as 1/factor has (10: 1, 4: 2), or else its digits */
function factorDecimals(factor: number): number {
	for (let decimals = 0; decimals <= 6; decimals++) {
		if (Number.isInteger(10 ** decimals / factor)) return decimals
	}
	return Math.ceil(Math.log10(Math.abs(factor)))
}

/**
 * A number by a C-style format string: its first conversion (`%d`, `%f` or `%x`, with the flags `-`, `+`, space, `0`
 * and `#`, a width and a precision) replaced by the number, and `%%` by "%". `%d` takes the number's integer part, or,
 * with a factor's decimals, the number with them.
 */
function formatNumber(format: string, value: number, decimals: number | undefined): string {
	let converted = false
	return format.replace(
		/%%|%([-+ 0#]*)(\d*)(?:\.(\d+))?([dfxX])/g,
		(match, flags: string | undefined, width: string | undefined, precision: string | undefined, conversion) => {
			if (match === '%%') return '%'
			if (converted) return match
			converted = true
			const magnitude = Math.abs(value)
			let digits: string
			if (conversion === 'f') {
				digits = magnitude.toFixed(precision === undefined ? 6 : Number(precision))
			} else if (conversion === 'd') {
				digits = decimals ? magnitude.toFixed(decimals) : String(Math.trunc(magnitude))
			} else {
				digits = Math.trunc(magnitude).toString(16)
				if (conversion === 'X') digits = digits.toUpperCase()
				if (flags?.includes('#') && digits !== '0') digits = (conversion === 'X' ? '0X' : '0x') + digits
			}
			const sign = value < 0 ? '-' : flags?.includes('+') ? '+' : flags?.includes(' ') ? ' ' : ''
			const size = Number(width || 0)
			if (flags?.includes('-')) return (sign + digits).padEnd(size)
			if (flags?.includes('0')) return sign + digits.padStart(size - sign.length, '0')
			return (sign + digits).padStart(size)
		}
	)
}
