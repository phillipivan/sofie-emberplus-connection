import * as Ber from '../../../Ber'
import { Connection, ConnectionOperation, ConnectionDisposition } from '../../../model/Connection'
import { encodeConnection } from '../encoder/Connection'
import { decodeConnection } from '../decoder/Connection'

describe('encodings/ber/Connection', () => {
    const connection = {
        target: 42,
        sources: [89, 98],
        operation: ConnectionOperation.Connect,
        disposition: ConnectionDisposition.Tally
    } as Connection

    test('write and read a connection', () => {
        const writer = new Ber.Writer()
        encodeConnection(connection, writer)
        console.log(writer.buffer)
        const reader = new Ber.Reader(writer.buffer)
        const decoded = decodeConnection(reader)

        expect(decoded).toEqual(connection)
    })

    test('write and read a connection - minimal', () => {
        const minCon = { target: 42 } as Connection 
        const writer = new Ber.Writer()
        encodeConnection(minCon, writer)
        console.log(writer.buffer)
        const reader = new Ber.Reader(writer.buffer)
        const decoded = decodeConnection(reader)

        expect(decoded).toEqual(minCon)
    })
})