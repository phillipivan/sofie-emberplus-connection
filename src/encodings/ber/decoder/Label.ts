import * as Ber from '../../../Ber'
import { Label, LabelImpl } from '../../../model/Label'
import { LabelBERID } from '../constants'
import {
	DecodeOptions,
	defaultDecode,
	DecodeResult,
	unknownContext,
	check,
	makeResult
} from './DecodeResult'

export { decodeLabel }

function decodeLabel(
	reader: Ber.Reader,
	options: DecodeOptions = defaultDecode
): DecodeResult<Label> {
	const ber = reader.getSequence(LabelBERID)
	let basePath: string | null = null
	let description: string | null = null
	const errors: Array<Error> = []
	while (ber.remain > 0) {
		const tag = ber.peek()
		if (tag === null) {
			unknownContext(errors, 'decode label', tag, options)
			continue
		}
		const seq = ber.getSequence(tag)
		switch (tag) {
			case Ber.CONTEXT(0):
				basePath = seq.readRelativeOID(Ber.BERDataTypes.RELATIVE_OID)
				break
			case Ber.CONTEXT(1):
				description = seq.readString(Ber.BERDataTypes.STRING)
				break
			default:
				unknownContext(errors, 'decode label', tag, options)
				break
		}
	}
	basePath = check(basePath, 'decode label', 'basePath', '', errors, options)
	description = check(description, 'decode label', 'description', '', errors, options)

	return makeResult(new LabelImpl(basePath, description), errors)
}
