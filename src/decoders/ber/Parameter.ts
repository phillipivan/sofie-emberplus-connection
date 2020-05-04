import * as Ber from '../../Ber'
import { Parameter, ParameterType, ParamterImpl } from '../../model/Parameter';
import { Tree, TreeImpl } from '../../model/Tree';
import { EmberTreeNode, StringIntegerCollection } from '../../types/types';
import { EmberElement } from '../../model/EmberElement';
import { StreamDescription } from '../../model/StreamDescription';
import { decodeChildren } from './Tree';

const ParameterBERID = Ber.APPLICATION(1)

export function decodeParameter (reader: Ber.Reader): EmberTreeNode<Parameter> {
	const ber = reader.getSequence(ParameterBERID)
	let num: number | undefined = undefined
	let param: Parameter | undefined = undefined
	let kids: Array<EmberTreeNode<EmberElement>> = []
	while (ber.remain > 0) {
		const tag = ber.peek()
		const seq = ber.getSequence(tag!)

		switch (tag) {
			case Ber.CONTEXT(0):
				num = seq.readInt()
				break
			case Ber.CONTEXT(1):
				param = decodeParameterContents(seq)
				break
			case Ber.CONTEXT(2):
				kids = decodeChildren(seq)
				break
		}
	}
	if (!param) {
		throw new Error('Decode parameter: failed to decode parameter')
	}
	param.number = typeof num === 'number' ? num : -1
	return new TreeImpl(param, undefined, kids)
}

function decodeParameterContents (reader: Ber.Reader): Parameter {
	const ber = reader.getSequence(Ber.BERDataTypes.SET)
	const p: Parameter = {} as Parameter

	while (ber.remain > 0) {
		const tag = ber.peek()
		const seq = ber.getSequence(tag!)
		switch (tag) {
			case Ber.CONTEXT(0):
				p.identifier = seq.readString(Ber.BERDataTypes.STRING)
				break
			case Ber.CONTEXT(1):
				p.description = seq.readString(Ber.BERDataTypes.STRING)
				break
			case Ber.CONTEXT(3):
				p.value = seq.readValue().value
				break
			case Ber.CONTEXT(3):
				p.minimum = seq.readValue().value as number | null
				break
			case Ber.CONTEXT(4):
				p.maximum = seq.readValue().value as number | null
				break;
			case Ber.CONTEXT(5):
				p.access = ParameterAccess.get(seq.readInt())
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
				p.default = seq.readValue().value; // Write value uses type
				break
			case Ber.CONTEXT(13):
				p.type = ParameterType.get(seq.readInt());
				break
			case Ber.CONTEXT(14):
				p.streamIdentifier = seq.readInt()
				break
			case Ber.CONTEXT(15):
				p.enumMap = StringIntegerCollection.decode(seq)
				break
			case Ber.CONTEXT(16):
				p.streamDescriptor = StreamDescription.decode(seq)
				break
			case Ber.CONTEXT(17):
				p.schemaIdentifiers = seq.readString(Ber.BERDataTypes.STRING)
				break
			default:
				throw new Errors.UnimplementedEmberTypeError(tag);
		}
	}

	return new ParameterImpl()

}
