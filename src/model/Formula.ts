export { Formula, FormulaError, FormulaInput, parseFormula }

/**
 * A parameter's formula (Glow DTD `formula`), parsed: "two formulas separated by a linefeed character", the first
 * turning the device's value into the value displayed (provider to consumer), the second turning a value entered back
 * into the device's (consumer to provider), which "may be omitted" for a read-only parameter.
 *
 * The syntax and arithmetic are those of the document "Ember+ Formulas" (Lawo, 2012), as Lawo's EmberLib.net
 * implements it (EmberLib.Glow.Formula): its grammar, its precedence and its two number types. Lawo's C++ libformula
 * differs from the document in places (round() rounds down, `^` always gives a real, `-2^2` is 4, `%` binds as `+`
 * does); this follows the document. The legacy RPN form the specification mentions ("5*") isn't supported: it has no
 * description beyond that example, and Lawo's parsers don't read it either.
 */
interface Formula {
	/** The value displayed for a device value: the first expression */
	toDisplay: (value: number, input?: FormulaInput) => number
	/** The device value for a value entered: the second expression; undefined when the formula has none */
	toDevice?: (value: number, input?: FormulaInput) => number
}

/**
 * The type `$` has in an expression, which decides the type of what is computed from it: an integer for an integer
 * parameter's value, as the document's "where $ is of type INTEGER" example has it, or else a real. By default, an
 * integer when the value is a whole number.
 */
type FormulaInput = 'integer' | 'real'

/** A formula that can't be parsed, or an expression that can't be computed (an integer division by zero) */
class FormulaError extends Error {
	constructor(message: string) {
		super(message)
		this.name = 'FormulaError'
	}
}

/**
 * Parses a parameter's formula: its two expressions, separated by a line feed. Expressions are read as the document
 * "Ember+ Formulas" describes them:
 *
 * - the input value `$`, numbers (`2`, `7.43`, `1e-3`), and the constants `PI` and `E`
 * - in ascending order of precedence: `+` and `-`; `*`, `/`, `\` (integer division) and `%` (modulo); negation; `^`
 *   (each group from left to right, so `2^3^2` is 64, and `-2^2` is -4); and parentheses
 * - the functions `sin`, `cos`, `tan`, `sinh`, `cosh`, `tanh`, `asin`, `acos`, `atan` (and `atan(y, x)`), `sqrt`,
 *   `log` (natural, and `log(x, base)`), `exp`, `round`, `ceil`, `int`, `float`, `abs` and `sgn`, in any case
 *
 * A value is an integer or a real. `+`, `-`, `*`, negation and `abs` keep integers integer, `/` always gives a real,
 * `\` and `%` work on their operands' integer parts and give an integer, `^` gives an integer for an integer to a
 * power of zero or more, `round` (to the closest integer, a half to the even one, as .NET's Math.Round), `ceil`, `int`
 * (truncating) and `sgn` give integers, and the other functions reals. Integers are JavaScript numbers, exact up to
 * 2^53.
 *
 * @throws FormulaError for a formula that can't be parsed
 */
function parseFormula(formula: string): Formula {
	const [first, second, ...rest] = formula.split(/\r?\n/)
	if (rest.some((line) => line.trim() !== '')) throw new FormulaError('A formula has at most two expressions')
	const toDisplay = parseExpression(first ?? '')
	const toDevice = second !== undefined && second.trim() !== '' ? parseExpression(second) : undefined
	const run = (expression: Expression) => (value: number, input?: FormulaInput) =>
		evaluate(expression, inputValue(value, input)).value
	return toDevice ? { toDisplay: run(toDisplay), toDevice: run(toDevice) } : { toDisplay: run(toDisplay) }
}

// ---- values

interface Value {
	integer: boolean
	value: number
}
const integer = (value: number): Value => ({ integer: true, value })
const real = (value: number): Value => ({ integer: false, value })
const asInteger = (v: Value): number => (v.integer ? v.value : Math.trunc(v.value))

function inputValue(value: number, input: FormulaInput | undefined): Value {
	const isInteger = input === undefined ? Number.isInteger(value) : input === 'integer'
	return isInteger ? integer(Math.trunc(value)) : real(value)
}

/** Rounds to the closest integer, a half to the even one, as .NET's Math.Round does by default */
function roundHalfToEven(x: number): number {
	const floor = Math.floor(x)
	const fraction = x - floor
	if (fraction > 0.5) return floor + 1
	if (fraction < 0.5) return floor
	return floor % 2 === 0 ? floor : floor + 1
}

// ---- syntax

type Expression =
	| { kind: 'it' }
	| { kind: 'number'; value: Value }
	| { kind: 'negate'; operand: Expression }
	| { kind: 'binary'; operator: BinaryOperator; left: Expression; right: Expression }
	| { kind: 'call'; name: FunctionName; args: Expression[] }

type BinaryOperator = '+' | '-' | '*' | '/' | '\\' | '%' | '^'

const FUNCTIONS = {
	sin: 1,
	cos: 1,
	tan: 1,
	sinh: 1,
	cosh: 1,
	tanh: 1,
	asin: 1,
	acos: 1,
	atan: 2,
	sqrt: 1,
	log: 2,
	exp: 1,
	round: 1,
	ceil: 1,
	int: 1,
	float: 1,
	abs: 1,
	sgn: 1,
} as const
type FunctionName = keyof typeof FUNCTIONS

function isFunctionName(word: string): word is FunctionName {
	return Object.hasOwn(FUNCTIONS, word)
}

type Token =
	| { kind: 'number'; value: Value }
	| { kind: 'word'; word: string }
	| { kind: 'symbol'; symbol: string }
	| { kind: 'end' }

/** The tokens of an expression, as EmberLib.net's lexer reads them */
function tokenize(text: string): Token[] {
	const tokens: Token[] = []
	// a real: digits with a fraction (and an exponent), or digits with an exponent, whose sign is required
	const pattern =
		/\s*(?:(\d+(?:\.\d+(?:[eE][-+]\d+)?|[eE][-+]\d+))|(\d+)|([_a-zA-Z][_a-zA-Z0-9]*)|([()*/\\%+\-^$,]))/y
	let offset = 0
	while (offset < text.length) {
		if (/^\s*$/.test(text.slice(offset))) break
		pattern.lastIndex = offset
		const match = pattern.exec(text)
		if (!match) throw new FormulaError(`Unexpected '${text.slice(offset).trim().charAt(0)}' in "${text}"`)
		offset = pattern.lastIndex
		const [, realText, integerText, word, symbol] = match
		if (realText !== undefined) tokens.push({ kind: 'number', value: real(Number(realText)) })
		else if (integerText !== undefined) tokens.push({ kind: 'number', value: integer(Number(integerText)) })
		else if (word !== undefined) tokens.push({ kind: 'word', word: word.toLowerCase() })
		else if (symbol !== undefined) tokens.push({ kind: 'symbol', symbol })
	}
	tokens.push({ kind: 'end' })
	return tokens
}

/**
 * An expression, by EmberLib.net's grammar (Parser.fsy):
 *
 *     Expression := Expression ('+' | '-') Product | Product
 *     Product    := Product ('*' | '/' | '\' | '%') Molecule | Molecule
 *     Molecule   := '-' Power | Power
 *     Power      := Power '^' Atom | Atom
 *     Atom       := '$' | number | PI | E | function '(' Expression [',' Expression] ')' | '(' Expression ')'
 */
function parseExpression(text: string): Expression {
	const tokens = tokenize(text)
	let position = 0
	const peek = (): Token => tokens[position] ?? { kind: 'end' }
	const isSymbol = (symbol: string) => {
		const token = peek()
		return token.kind === 'symbol' && token.symbol === symbol
	}
	const expect = (symbol: string) => {
		if (!isSymbol(symbol)) throw new FormulaError(`Expected '${symbol}' in "${text}"`)
		position++
	}

	const expression = (): Expression => {
		let left = product()
		while (isSymbol('+') || isSymbol('-')) {
			const operator = isSymbol('+') ? '+' : '-'
			position++
			left = { kind: 'binary', operator, left, right: product() }
		}
		return left
	}
	const product = (): Expression => {
		let left = molecule()
		for (;;) {
			const operator = (['*', '/', '\\', '%'] as const).find(isSymbol)
			if (!operator) return left
			position++
			left = { kind: 'binary', operator, left, right: molecule() }
		}
	}
	const molecule = (): Expression => {
		if (!isSymbol('-')) return power()
		position++
		return { kind: 'negate', operand: power() }
	}
	const power = (): Expression => {
		let left = atom()
		while (isSymbol('^')) {
			position++
			left = { kind: 'binary', operator: '^', left, right: atom() }
		}
		return left
	}
	const atom = (): Expression => {
		const token = peek()
		position++
		if (token.kind === 'number') return { kind: 'number', value: token.value }
		if (token.kind === 'symbol' && token.symbol === '$') return { kind: 'it' }
		if (token.kind === 'symbol' && token.symbol === '(') {
			const inner = expression()
			expect(')')
			return inner
		}
		if (token.kind === 'word') {
			if (token.word === 'pi') return { kind: 'number', value: real(Math.PI) }
			if (token.word === 'e') return { kind: 'number', value: real(Math.E) }
			if (!isFunctionName(token.word)) throw new FormulaError(`Unknown keyword '${token.word}' in "${text}"`)
			expect('(')
			const args = [expression()]
			if (FUNCTIONS[token.word] === 2 && isSymbol(',')) {
				position++
				args.push(expression())
			}
			expect(')')
			return { kind: 'call', name: token.word, args }
		}
		const found = token.kind === 'end' ? 'the end' : `'${token.kind === 'symbol' ? token.symbol : '?'}'`
		throw new FormulaError(`Unexpected ${found} in "${text}"`)
	}

	const parsed = expression()
	if (peek().kind !== 'end') throw new FormulaError(`Unexpected text after the expression in "${text}"`)
	return parsed
}

// ---- arithmetic, as EmberLib.net's Interpreter.fs

function evaluate(expression: Expression, it: Value): Value {
	switch (expression.kind) {
		case 'it':
			return it
		case 'number':
			return expression.value
		case 'negate': {
			const operand = evaluate(expression.operand, it)
			return { integer: operand.integer, value: -operand.value }
		}
		case 'binary':
			return binary(expression.operator, evaluate(expression.left, it), evaluate(expression.right, it))
		case 'call':
			return call(
				expression.name,
				expression.args.map((arg) => evaluate(arg, it))
			)
	}
}

function binary(operator: BinaryOperator, left: Value, right: Value): Value {
	const both = left.integer && right.integer
	switch (operator) {
		case '+':
			return { integer: both, value: left.value + right.value }
		case '-':
			return { integer: both, value: left.value - right.value }
		case '*':
			return { integer: both, value: left.value * right.value }
		case '/':
			return real(left.value / right.value)
		case '\\':
		case '%': {
			const divisor = asInteger(right)
			if (divisor === 0) throw new FormulaError(`Integer ${operator === '%' ? 'modulo' : 'division'} by zero`)
			const dividend = asInteger(left)
			return integer(operator === '%' ? dividend % divisor : Math.trunc(dividend / divisor))
		}
		case '^':
			return both && right.value >= 0
				? integer(left.value ** right.value)
				: real(Math.pow(left.value, right.value))
	}
}

function call(name: FunctionName, args: Value[]): Value {
	const [x = real(NaN), y] = args
	switch (name) {
		case 'sin':
			return real(Math.sin(x.value))
		case 'cos':
			return real(Math.cos(x.value))
		case 'tan':
			return real(Math.tan(x.value))
		case 'sinh':
			return real(Math.sinh(x.value))
		case 'cosh':
			return real(Math.cosh(x.value))
		case 'tanh':
			return real(Math.tanh(x.value))
		case 'asin':
			return real(Math.asin(x.value))
		case 'acos':
			return real(Math.acos(x.value))
		case 'atan':
			return real(y ? Math.atan2(x.value, y.value) : Math.atan(x.value))
		case 'sqrt':
			return real(Math.sqrt(x.value))
		case 'log':
			return real(y ? Math.log(x.value) / Math.log(y.value) : Math.log(x.value))
		case 'exp':
			return real(Math.exp(x.value))
		case 'round':
			return integer(roundHalfToEven(x.value))
		case 'ceil':
			return integer(Math.ceil(x.value))
		case 'int':
			return integer(asInteger(x))
		case 'float':
			return real(x.value)
		case 'abs':
			return { integer: x.integer, value: Math.abs(x.value) }
		case 'sgn':
			return integer(Math.sign(x.value))
	}
}
