import { hasSignal, Matrix, MatrixAddressingMode, MatrixImpl, signalsOf } from '../Matrix.js'

describe('hasSignal', () => {
	const nonLinear = new MatrixImpl('m', signalsOf([1, 5]), signalsOf([2, 7]))
	nonLinear.addressingMode = MatrixAddressingMode.NonLinear
	const linear = (targetCount?: number, sourceCount?: number): Matrix => {
		const m = new MatrixImpl('m')
		m.targetCount = targetCount
		m.sourceCount = sourceCount
		return m // addressing mode left out: linear, the default
	}

	test.each<[string, Matrix, 'target' | 'source', number, boolean | undefined]>([
		['a listed target', nonLinear, 'target', 5, true],
		['a target not listed', nonLinear, 'target', 2, false],
		['a listed source', nonLinear, 'source', 7, true],
		['a source not listed', nonLinear, 'source', 5, false],
		['a target below the count of a linear matrix', linear(4, 2), 'target', 3, true],
		['a target at the count of a linear matrix', linear(4, 2), 'target', 4, false],
		['a negative source of a linear matrix', linear(4, 2), 'source', -1, false],
		['a target of a linear matrix without a count', linear(), 'target', 3, undefined],
		[
			'a target of a non-linear matrix without a list',
			new MatrixImpl(
				'm',
				undefined,
				undefined,
				undefined,
				undefined,
				undefined,
				MatrixAddressingMode.NonLinear,
				4
			),
			'target',
			3,
			undefined,
		],
	])('%s: %s', (_, matrix, kind, signal, result) => {
		expect(hasSignal(matrix, kind, signal)).toBe(result)
	})
})
