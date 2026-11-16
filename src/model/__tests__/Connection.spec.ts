import { ConnectionDisposition, ConnectionImpl, ConnectionOperation, isConnection } from '../Connection.js'
import { isConnections } from '../Matrix.js'

describe('isConnection', () => {
	test.each<[string, unknown, boolean]>([
		['a target alone', { target: 1 }, true],
		[
			'a target with sources, an operation and a disposition',
			new ConnectionImpl(1, [2, 3], ConnectionOperation.Connect, ConnectionDisposition.Tally),
			true,
		],
		['no target', { sources: [2] }, false],
		['a target that is not a number', { target: '1' }, false],
		['sources that are not numbers', { target: 1, sources: ['2'] }, false],
		['sources that are not a list', { target: 1, sources: 2 }, false],
		['an unknown operation', { target: 1, operation: 'MERGE' }, false],
		['an unknown disposition', { target: 1, disposition: 'DONE' }, false],
		['null', null, false],
	])('%s: %s', (_, value, result) => {
		expect(isConnection(value)).toBe(result)
	})
})

describe('isConnections', () => {
	test.each<[string, unknown, boolean]>([
		['connections by target', { 1: new ConnectionImpl(1, [2]), 3: new ConnectionImpl(3) }, true],
		['none', {}, true],
		['one that is not a connection', { 1: new ConnectionImpl(1), 2: { sources: [1] } }, false],
		['a list', [new ConnectionImpl(1)], false],
		['a number', 1, false],
	])('%s: %s', (_, value, result) => {
		expect(isConnections(value)).toBe(result)
	})
})
