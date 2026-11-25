import { AddressInfo } from 'net'

import {
	childrenOf,
	ElementType,
	EmberElement,
	EmberNodeImpl,
	MatrixImpl,
	NumberedTreeNodeImpl,
	Parameter,
	ParameterImpl,
	ParameterType,
	QualifiedElementImpl,
	signalsOf,
} from '../../../model/index.js'
import { LabelImpl } from '../../../model/Label.js'
import { isElementOfType } from '../../Lib/util.js'
import { EmberServer } from '../../Server/index.js'
import { S101Server } from '../../Socket/S101Server.js'
import { EmberClient, TreeChange } from '../index.js'

// A client and a provider over TCP, unmocked: what a provider sends when a label changes reaches the change event with
// whose label it is, for a label set fetched with getMatrixLabels and for a signal's labelsLocation.
describe('the change event with a provider', () => {
	const label = (number: number, text: string) =>
		new NumberedTreeNodeImpl<Parameter>(
			number,
			new ParameterImpl(ParameterType.String, `label-${number}`, undefined, text)
		)

	/** A provider's tree: a matrix at 1.1, its label set at 1.9, and its target 1's labelsLocation at 1.8 */
	function providerTree() {
		const matrix = new MatrixImpl('router', new Map([[1, { labelsLocation: '1.8' as const }]]), signalsOf([1]))
		matrix.labels = [new LabelImpl('1.9', 'Default Labels')]
		const targetLabel = label(1, 'Out 1')
		const locationLabel = label(1, 'Out 1 long')
		const device = new NumberedTreeNodeImpl<EmberElement>(
			1,
			new EmberNodeImpl('device'),
			childrenOf([
				new NumberedTreeNodeImpl(1, matrix),
				new NumberedTreeNodeImpl(
					9,
					new EmberNodeImpl('labels'),
					childrenOf([
						new NumberedTreeNodeImpl(1, new EmberNodeImpl('targets'), childrenOf([targetLabel])),
						new NumberedTreeNodeImpl(2, new EmberNodeImpl('sources'), childrenOf([label(1, 'In 1')])),
					])
				),
				new NumberedTreeNodeImpl(8, new EmberNodeImpl('target 1 labels'), childrenOf([locationLabel])),
			])
		)
		return { device, targetLabel, locationLabel }
	}

	let server: EmberServer | undefined
	let client: EmberClient | undefined
	afterEach(async () => {
		await client?.disconnect()
		client?.discard()
		server?.discard()
	})

	/** Resolves with the next change event's changes */
	const nextChanges = async (from: EmberClient) =>
		new Promise<Array<TreeChange>>((resolve) => from.once('change', resolve))

	it("says whose label a provider's changed label is", async () => {
		const { device, targetLabel, locationLabel } = providerTree()
		server = new EmberServer(0, '127.0.0.1')
		await server.init(childrenOf([device]))
		const port = ((server as unknown as { _server: S101Server })._server.server?.address() as AddressInfo).port

		client = new EmberClient('127.0.0.1', port)
		await client.connect()
		await (
			await client.getDirectory(client.tree)
		).response
		await client.getElementByPath('1.1')
		const matrix = client.tree.get(1)?.children?.get(1)
		if (!matrix || !isElementOfType(matrix, ElementType.Matrix)) throw new Error('Expected the matrix at 1.1')
		// the matrix's own GetDirectory brings its targets and sources, with their labelsLocations
		await (
			await client.getDirectory(matrix)
		).response
		const sets = await client.getMatrixLabels(matrix)
		await (
			await client.getDirectory(new QualifiedElementImpl('1.8', new EmberNodeImpl()))
		).response
		expect(sets).toMatchObject([{ basePath: '1.9', targets: { 1: 'Out 1' }, sources: { 1: 'In 1' } }])

		const labelSetChange = nextChanges(client)
		server.update(targetLabel, { value: 'PGM' })
		expect(await labelSetChange).toEqual([
			expect.objectContaining({
				path: '1.9.1.1',
				label: expect.objectContaining({ matrixPath: '1.1', kind: 'target', signal: 1, text: 'PGM' }),
			}),
		])

		const locationChange = nextChanges(client)
		server.update(locationLabel, { value: 'Programme out' })
		const [change] = await locationChange
		expect(change?.label).toEqual(
			expect.objectContaining({ matrixPath: '1.1', kind: 'target', signal: 1, text: 'Programme out' })
		)
		expect(change?.label).not.toHaveProperty('set')
	})
})
