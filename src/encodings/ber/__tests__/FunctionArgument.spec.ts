import * as Ber from '../../../Ber'
import { FunctionArgument } from '../../../model/FunctionArgument'
import { encodeFunctionArgument } from '../encoder/FunctionArgument'
import { decodeFunctionArgument } from '../decoder/FunctionArgument'
import { ParameterType } from '../../../model/Parameter'

describe('encoders/ber/FunctionArgument', () => {
	const fa = {
		type: ParameterType.String,
		name: 'fred'
	} as FunctionArgument

	test('write and read function argument', () => {
		const writer = new Ber.Writer()
		encodeFunctionArgument(fa, writer)
		console.log(writer.buffer)
		const reader = new Ber.Reader(writer.buffer)
		const decoded = decodeFunctionArgument(reader)

		expect(decoded).toEqual(fa)
	})

	test('write and read function argument', () => {
		const noName = {
			type: ParameterType.Boolean
		} as FunctionArgument
		const writer = new Ber.Writer()
		encodeFunctionArgument(noName, writer)
		console.log(writer.buffer)
		const reader = new Ber.Reader(writer.buffer)
		const decoded = decodeFunctionArgument(reader)

		expect(decoded).toEqual(noName)
	})
})
