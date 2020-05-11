import * as Ber from '../../../Ber'
import { Invocation } from '../../../model/Invocation'
import { encodeInvocation } from '../encoder/Invocation'
import { decodeInvocation } from '../decoder/Invocation'
import { ParameterType } from '../../../model/Parameter'

describe('encodings/ber/Invocation', () => {
	const iv = {
		id: 45654,
		args: [
			{ type: ParameterType.Integer, value: -1 },
			{ type: ParameterType.Boolean, value: false },
			{ type: ParameterType.String, value: 'twotyfour' }
		]
	} as Invocation

	const noArgs = {
		id: 234,
		args: []
	} as Invocation

	const noId = {
		args: [{ type: ParameterType.Integer, value: 47 }]
	}

	test('write and read an invocation - 3 args', () => {
		const writer = new Ber.Writer()
		encodeInvocation(iv, writer)
		console.log(writer.buffer)
		const reader = new Ber.Reader(writer.buffer)
		const decoded = decodeInvocation(reader)

		expect(decoded).toEqual(iv)
	})

	test('write and read an invocation - no arguments', () => {
		const writer = new Ber.Writer()
		encodeInvocation(noArgs, writer)
		console.log(writer.buffer)
		const reader = new Ber.Reader(writer.buffer)
		const decoded = decodeInvocation(reader)

		expect(decoded).toEqual(noArgs)
	})

	test('write and read an invocation - no identifier', () => {
		const writer = new Ber.Writer()
		encodeInvocation(noId, writer)
		console.log(writer.buffer)
		const reader = new Ber.Reader(writer.buffer)
		const decoded = decodeInvocation(reader)

		expect(decoded).toEqual(noId)
	})
})
