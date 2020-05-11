import * as Ber from '../../../Ber'
import { Parameter, ParameterType, ParameterImpl, ParameterAccess } from '../../../model/Parameter'
// import { TreeImpl } from '../../../model/Tree'
// import { EmberTreeNode } from '../../../types/types'
// import { EmberElement } from '../../../model/EmberElement'
import { decodeStreamDescription } from './StreamDescription'
// import { decodeChildren } from './Tree';
// import { ParameterBERID } from '../constants';
import { decodeStringIntegerCollection } from './StringIntegerCollection'

export { decodeParameter, readParameterType }

// function decodeParameter (reader: Ber.Reader): EmberTreeNode<Parameter> {
// 	const ber = reader.getSequence(ParameterBERID)
// 	//let _num: number | undefined = undefined
// 	let param: Parameter | undefined = undefined
// 	let kids: Array<EmberTreeNode<EmberElement>> = []
// 	while (ber.remain > 0) {
// 		const tag = ber.peek()
// 		const seq = ber.getSequence(tag!)

// 		switch (tag) {
// 			case Ber.CONTEXT(0):
// 				//_num = seq.readInt()
// 				break
// 			case Ber.CONTEXT(1):
// 				param = decodeParameterContents(seq)
// 				break
// 			case Ber.CONTEXT(2):
// 				kids = decodeChildren(seq)
// 				break
// 		}
// 	}
// 	if (!param) {
// 		throw new Error('Decode parameter: failed to decode parameter')
// 	}
// 	// param.number = typeof num === 'number' ? num : -1
// 	return new TreeImpl(param, undefined, kids)
// }

function decodeParameter(reader: Ber.Reader): Parameter {
	const ber = reader.getSequence(Ber.BERDataTypes.SET)
	const p: Parameter = {} as Parameter

	while (ber.remain > 0) {
		const tag = ber.peek()
		if (tag === null) {
			throw new Error(``)
		}
		const seq = ber.getSequence(tag)
		switch (tag) {
			case Ber.CONTEXT(0):
				p.identifier = seq.readString(Ber.BERDataTypes.STRING)
				break
			case Ber.CONTEXT(1):
				p.description = seq.readString(Ber.BERDataTypes.STRING)
				break
			case Ber.CONTEXT(2):
				p.value = seq.readValue().value
				break
			case Ber.CONTEXT(3):
				p.minimum = seq.readValue().value as number | null
				break
			case Ber.CONTEXT(4):
				p.maximum = seq.readValue().value as number | null
				break
			case Ber.CONTEXT(5):
				p.access = readParameterAccess(seq.readInt())
				break
			case Ber.CONTEXT(6):
				p.format = seq.readString(Ber.BERDataTypes.STRING)
				break
			case Ber.CONTEXT(7):
				p.enumeration = seq.readString(Ber.BERDataTypes.STRING)
				break
			case Ber.CONTEXT(8):
				p.factor = seq.readInt()
				break
			case Ber.CONTEXT(9):
				p.isOnline = seq.readBoolean()
				break
			case Ber.CONTEXT(10):
				p.formula = seq.readString(Ber.BERDataTypes.STRING)
				break
			case Ber.CONTEXT(11):
				p.step = seq.readInt()
				break
			case Ber.CONTEXT(12):
				p.defaultValue = seq.readValue().value // Write value uses type
				break
			case Ber.CONTEXT(13):
				p.parameterType = readParameterType(seq.readInt())
				break
			case Ber.CONTEXT(14):
				p.streamIdentifier = seq.readInt()
				break
			case Ber.CONTEXT(15):
				p.enumMap = decodeStringIntegerCollection(seq)
				break
			case Ber.CONTEXT(16):
				p.streamDescriptor = decodeStreamDescription(seq)
				break
			case Ber.CONTEXT(17):
				p.schemaIdentifiers = seq.readString(Ber.BERDataTypes.STRING)
				break
			case Ber.CONTEXT(18):
				p.templateReference = seq.readString(Ber.BERDataTypes.STRING)
				break
			default:
				throw new Error(``)
		}
	}

	return new ParameterImpl(
		p.parameterType,
		p.identifier,
		p.description,
		p.value,
		p.maximum,
		p.minimum,
		p.access,
		p.format,
		p.enumeration,
		p.factor,
		p.isOnline,
		p.formula,
		p.step,
		p.defaultValue,
		p.streamIdentifier,
		p.enumMap,
		p.streamDescriptor,
		p.schemaIdentifiers,
		p.templateReference
	)
}

function readParameterAccess(value: number): ParameterAccess {
	switch (value) {
		case 0:
			return ParameterAccess.None
		case 1:
			return ParameterAccess.Read
		case 2:
			return ParameterAccess.Write
		case 3:
			return ParameterAccess.ReadWrite
		default:
			throw new Error(``)
	}
}

function readParameterType(value: number): ParameterType {
	switch (value) {
		case 0:
			return ParameterType.Null
		case 1:
			return ParameterType.Integer
		case 2:
			return ParameterType.Real
		case 3:
			return ParameterType.String
		case 4:
			return ParameterType.Boolean
		case 5:
			return ParameterType.Trigger
		case 6:
			return ParameterType.Enum
		case 7:
			return ParameterType.Octets
		default:
			throw new Error(``)
	}
}
