import * as Ber from '../../../Ber'
import { StreamEntry } from '../../../model/StreamEntry'
import { encodeStreamEntry } from '../encoder/StreamEntry'
import { decodeStreamEntry } from '../decoder/StreamEntry'
import { ParameterType } from '../../../model/Parameter'

describe('encodings/ber/StreamEntry', () => {

    test('write and read stream entry - integer', () => {
        const se = {
            identifier: 42,
            value: { type: ParameterType.Integer, value: 42 }
        } as StreamEntry

        const writer = new Ber.Writer()
        encodeStreamEntry(se, writer)
        console.log(writer.buffer)
        const reader = new Ber.Reader(writer.buffer)
        const decoded = decodeStreamEntry(reader)

        expect(decoded).toEqual(se)
    })

    test('write and read stream entry - real', () => {
        const se = {
            identifier: 43,
            value: { type: ParameterType.Real, value: 42.3 }
        } as StreamEntry
        
        const writer = new Ber.Writer()
        encodeStreamEntry(se, writer)
        console.log(writer.buffer)
        const reader = new Ber.Reader(writer.buffer)
        const decoded = decodeStreamEntry(reader)

        expect(decoded).toEqual(se)
    })

    test('write and read stream entry - string', () => {
        const se = {
            identifier: 42,
            value: { type: ParameterType.String, value: 'roundtrip stream entry' }
        } as StreamEntry
        
        const writer = new Ber.Writer()
        encodeStreamEntry(se, writer)
        console.log(writer.buffer)
        const reader = new Ber.Reader(writer.buffer)
        const decoded = decodeStreamEntry(reader)

        expect(decoded).toEqual(se)
    })

    test('write and read stream entry - false', () => {
        const se = {
            identifier: 42,
            value: { type: ParameterType.Boolean, value: false }
        } as StreamEntry
        
        const writer = new Ber.Writer()
        encodeStreamEntry(se, writer)
        console.log(writer.buffer)
        const reader = new Ber.Reader(writer.buffer)
        const decoded = decodeStreamEntry(reader)

        expect(decoded).toEqual(se)
    })

    test('write and read stream entry - true', () => {
        const se = {
            identifier: 42,
            value: { type: ParameterType.Boolean, value: true }
        } as StreamEntry
        
        const writer = new Ber.Writer()
        encodeStreamEntry(se, writer)
        console.log(writer.buffer)
        const reader = new Ber.Reader(writer.buffer)
        const decoded = decodeStreamEntry(reader)

        expect(decoded).toEqual(se)
    })

    test('write and read stream entry - octets', () => {
        const se = {
            identifier: 42,
            value: { type: ParameterType.Octets, value: Buffer.from('roundtrip a buffer') }
        } as StreamEntry
        
        const writer = new Ber.Writer()
        encodeStreamEntry(se, writer)
        console.log(writer.buffer)
        const reader = new Ber.Reader(writer.buffer)
        const decoded = decodeStreamEntry(reader)

        expect(decoded).toEqual(se)
    })

    test('write and read stream entry - empty buffer', () => {
        const se = {
            identifier: 42,
            value: { type: ParameterType.Octets, value: Buffer.alloc(0) }
        } as StreamEntry
        
        const writer = new Ber.Writer()
        encodeStreamEntry(se, writer)
        console.log(writer.buffer)
        const reader = new Ber.Reader(writer.buffer)
        const decoded = decodeStreamEntry(reader)

        expect(decoded).toEqual(se)
    })

    test('write and read stream entry - null', () => {
        const se = {
            identifier: 42,
            value: { type: ParameterType.Null, value: null }
        } as StreamEntry
        
        const writer = new Ber.Writer()
        encodeStreamEntry(se, writer)
        console.log(writer.buffer)
        const reader = new Ber.Reader(writer.buffer)
        const decoded = decodeStreamEntry(reader)

        expect(decoded).toEqual(se)
    })

}) 