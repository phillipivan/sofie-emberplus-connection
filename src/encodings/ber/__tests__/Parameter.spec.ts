import * as Ber from '../../../Ber'
import { Parameter, ParameterType } from '../../../model/Parameter'
import { encodeParameter } from '../encoder/Parameter'
import { decodeParameter } from '../decoder/Parameter'
import { ElementType } from '../../../model/EmberElement'

describe('encodings/ber/Parameter', () => {
    const prm = {
        type: ElementType.Parameter,
        parameterType: ParameterType.String
    } as Parameter

    test('write and read a parameter', () => {
        const writer = new Ber.Writer()
        encodeParameter(prm, writer)
        console.log(writer.buffer)
        const reader = new Ber.Reader(writer.buffer)
        const decoded = decodeParameter(reader)

        expect(decoded).toEqual(prm)
    })
})