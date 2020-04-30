import * as Ber from '../../Ber'
import { InvocationResult } from '../../model/InvocationResult'

export function encodeInvocationResult(result: InvocationResult, writer: Ber.Writer) {
	writer.startSequence(Ber.APPLICATION(23))
	if (result.id != null) {
		writer.startSequence(Ber.CONTEXT(0))
		writer.writeInt(result.id)
		writer.endSequence()
	}
	if (result.success != null) {
		writer.startSequence(Ber.CONTEXT(1))
		writer.writeBoolean(result.success)
		writer.endSequence()
	}
	if (result.result != null && result.result.length) {
		writer.startSequence(Ber.CONTEXT(2))
		writer.startSequence(Ber.BERDataTypes.SEQUENCE)
		for (let i = 0; i < result.result.length; i++) {
			writer.startSequence(Ber.CONTEXT(0))
			// TODO - Need the function to be able to know the actual value type
			writer.writeValue(result.result[i])
			writer.endSequence()
		}
		writer.endSequence()
		writer.endSequence()
	}
	writer.endSequence() // BER.APPLICATION(23)}
}
