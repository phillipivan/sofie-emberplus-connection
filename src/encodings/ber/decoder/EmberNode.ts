import * as Ber from '../../../Ber'
import { EmberNode, EmberNodeImpl } from '../../../model/EmberNode'
import {
	DecodeOptions,
	defaultDecode,
	DecodeResult,
	unknownContext,
	makeResult
} from './DecodeResult'
import { RelativeOID } from '../../../types/types'

export { decodeNode }

function decodeNode(
	reader: Ber.Reader,
	options: DecodeOptions = defaultDecode
): DecodeResult<EmberNode> {
	const ber = reader.getSequence(Ber.BERDataTypes.SET)
	let identifier: string | undefined = undefined
	let description: string | undefined = undefined
	let isRoot: boolean | undefined = undefined
	let isOnline: boolean | undefined = undefined
	let schemaIdentifiers: string | undefined = undefined
	let templateReference: RelativeOID | undefined = undefined
	const errors: Array<Error> = []
	while (ber.remain > 0) {
		const tag = ber.peek()
		if (tag === null) {
			unknownContext(errors, 'decode node', tag, options)
			continue
		}
		const seq = ber.getSequence(tag)
		switch (tag) {
			case Ber.CONTEXT(0):
				identifier = seq.readString(Ber.BERDataTypes.STRING)
				break
			case Ber.CONTEXT(1):
				description = seq.readString(Ber.BERDataTypes.STRING)
				break
			case Ber.CONTEXT(2):
				isRoot = seq.readBoolean()
				break
			case Ber.CONTEXT(3):
				isOnline = seq.readBoolean()
				break
			case Ber.CONTEXT(4):
				schemaIdentifiers = seq.readString(Ber.BERDataTypes.STRING)
				break
			case Ber.CONTEXT(5):
				templateReference = seq.readRelativeOID(Ber.BERDataTypes.RELATIVE_OID)
				break
			default:
				unknownContext(errors, 'deocde node', tag, options)
				break
		}
	}
	return makeResult(
		new EmberNodeImpl(
			identifier,
			description,
			isRoot,
			isOnline,
			schemaIdentifiers,
			templateReference
		),
		errors
	)
}
