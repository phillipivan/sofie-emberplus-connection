import * as Ber from '../../../Ber'
import { InvocationResult } from '../../../model/InvocationResult'
import { encodeInvocationResult } from '../encoder/InvocationResult'
import { decodeInvocationResult } from '../decoder/InvocationResult'
import { ParameterType } from '../../../model/Parameter'

describe('encodings/ber/InvocationResult', () => {
    const ir = {
        id: 42,
        success: true,
        result: [
           { type: ParameterType.String, value: 'fortytwo' },
           { type: ParameterType.Real, value: 42.1 }
        ]
    } as InvocationResult

    const voidRes = {
        id: 987654,
        success: true
    } as InvocationResult

    test('write and read invocation result', () => { 
        const writer = new Ber.Writer()
        encodeInvocationResult(ir, writer)
        console.log(writer.buffer)
        const reader = new Ber.Reader(writer.buffer)
        const decoded = decodeInvocationResult(reader)

        expect(decoded).toEqual(ir)
    })

    test('write and read invocation result - void return', () => {
        const writer = new Ber.Writer()
        encodeInvocationResult(voidRes, writer)
        console.log(writer.buffer)
        const reader = new Ber.Reader(writer.buffer)
        const decoded = decodeInvocationResult(reader)

        expect(decoded).toEqual(voidRes)
    })

    // Note: Using an empty array result is encoded the same as no array
    test('write and read invocation result - empty result', () => {
        const writer = new Ber.Writer()
        encodeInvocationResult({ id: voidRes.id, success: true, result: [] }, writer)
        console.log(writer.buffer)
        const reader = new Ber.Reader(writer.buffer)
        const decoded = decodeInvocationResult(reader)

        expect(decoded).toEqual(voidRes)
    })
})