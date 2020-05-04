import * as Ber from '../../Ber'
import { Label, LabelImpl } from '../../model/Label';

const LabelBERID = Ber.APPLICATION(18)

export function decodeLabel(reader: Ber.Reader): Label {
	const ber = reader.getSequence(LabelBERID)
	let basePath: string | null = null
	let description: string | null = null
	while (ber.remain > 0) {
		const tag = ber.peek()
		const seq = ber.getSequence(tag!)
		switch (tag) {
			case Ber.CONTEXT(0):
				basePath = seq.readRelativeOID(Ber.BERDataTypes.RELATIVE_OID)
				break
			case Ber.CONTEXT(1):
				description = seq.readString(Ber.BERDataTypes.STRING)
			  break
			default:
			  throw new Error(``)
		}
	}
	if (basePath === null) {
		throw new Error(``)
	}
	if (description === null) {
		throw new Error(``)
	}

	return new LabelImpl(basePath, description)
}
