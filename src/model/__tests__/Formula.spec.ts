import { FormulaError, parseFormula } from '../Formula.js'

/** The first expression's value for the input given (an integer for a whole number unless said otherwise) */
const display = (expression: string, input = 0, type?: 'integer' | 'real') =>
	parseFormula(expression).toDisplay(input, type)

// The document "Ember+ Formulas" (Lawo, 2012), as Lawo's EmberLib.net implements it
describe('parseFormula', () => {
	// "Operators", with the document's own examples and the types it gives their results
	test.each<[string, number]>([
		['100 + 12.1', 112.1],
		['75 - 5', 70],
		['12.4 * 2', 24.8],
		['1 / 2', 0.5],
		['12.4 \\ 5', 2],
		['15 % 4.5', 3],
		['-11.3', -11.3],
		['2^10', 1024],
		['2^(9 + 1)', 1024],
	])('computes %s as %d', (expression, value) => {
		expect(display(expression)).toBeCloseTo(value, 12)
	})

	// "In ascending order of precedence": + and -; *, /, \ and %; negation; ^. Each from left to right.
	test.each<[string, number]>([
		['1 + 2 * 3', 7],
		['1 + 5 % 3', 3], // libformula: 0, % binding as + does
		['-2^2', -4], // libformula: 4, the minus binding to the 2
		['2^3^2', 64], // from left to right: (2^3)^2
		['10 - 4 - 3', 3],
		['2 * -3', -6],
		['(1 + 2) * 3', 9],
	])('reads %s as %d', (expression, value) => {
		expect(display(expression)).toBe(value)
	})

	// The two types: "DOUBLE if at least one of the two operands is of type DOUBLE", "/" always a DOUBLE, "\" and "%"
	// on the integer parts, "^" an INTEGER for INTEGERs and a power of zero or more
	test.each<[string, number]>([
		['7 / 2', 3.5],
		['7 \\ 2', 3],
		['-7 \\ 2', -3],
		['-7 % 3', -1],
	])('gives %s as %d', (expression, value) => {
		expect(display(expression)).toBe(value)
	})

	test('takes $ as the input value, of the type given', () => {
		expect(display('$ / 2', 5)).toBe(2.5)
		expect(display('$ \\ 2', 5)).toBe(2)
		expect(display('$ * 2', 1.25)).toBe(2.5)
		expect(display('$ ^ 2', 3, 'real')).toBe(9)
	})

	// "Built-in Constants" and "Built-in Functions", in any case
	test.each<[string, number]>([
		['PI', Math.PI],
		['e', Math.E],
		['sin(PI / 2)', 1],
		['COS(0)', 1],
		['atan(1, 1)', Math.PI / 4],
		['sqrt(16)', 4],
		['log(E)', 1],
		['log(8, 2)', 3],
		['exp(0)', 1],
		['ceil(1.2)', 2],
		['int(-1.7)', -1],
		['float(3)', 3],
		['abs(-4)', 4],
		['sgn(-0.5)', -1],
	])('computes %s', (expression, value) => {
		expect(display(expression)).toBeCloseTo(value, 12)
	})

	// "Round to closest integer": a half to the even one, as .NET's Math.Round (libformula's round() rounds down)
	test.each<[number, number]>([
		[2.4, 2],
		[2.6, 3],
		[2.5, 2],
		[3.5, 4],
		[-2.5, -2],
		[-2.6, -3],
	])('rounds %d to %d', (input, value) => {
		expect(display('round($)', input, 'real')).toBe(value)
	})

	// The document's examples: each expression undoes the other
	test.each<[string, number]>([
		['$ / 2\n$ * 2', 10],
		['exp($)\nlog($)', 1.5],
		['1 + log($, 2)\n2^($ - 1)', 8],
	])('the second expression of %j undoes the first', (formula, value) => {
		const { toDisplay, toDevice } = parseFormula(formula)
		expect(toDevice?.(toDisplay(value, 'real'), 'real')).toBeCloseTo(value, 9)
	})

	// "In the case of read-only parameters, the second expression may be omitted"
	test('has no second expression when it is left out', () => {
		expect(parseFormula('$ * 2').toDevice).toBeUndefined()
		expect(parseFormula('$ * 2\n').toDevice).toBeUndefined()
	})

	test.each<[string, RegExp]>([
		['foo($)', /Unknown keyword 'foo'/],
		['(1 + 2', /Expected '\)'/],
		['1 +', /Unexpected the end/],
		['1 2', /Unexpected text after the expression/],
		['5*', /Unexpected the end/], // the legacy RPN form isn't read
		['2^-1', /Unexpected '-'/], // the grammar takes no sign in an exponent
		['1 # 2', /Unexpected '#'/],
		['$\n$\n$', /at most two expressions/],
	])('refuses %j', (formula, message) => {
		expect(() => parseFormula(formula)).toThrow(message)
		expect(() => parseFormula(formula)).toThrow(FormulaError)
	})

	test('refuses an integer division by zero when computing it', () => {
		expect(() => display('1 \\ 0')).toThrow('Integer division by zero')
		expect(() => display('1 % $', 0)).toThrow('Integer modulo by zero')
		expect(display('1 / 0')).toBe(Infinity) // "/" gives a real
	})
})
