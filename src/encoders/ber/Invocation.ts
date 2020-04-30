import { Invocation } from '../../model/Invocation'
import * as Ber from '../../Ber'

export function encodeInvocation(invocation: Invocation, writer: Ber.Writer) {
	writer.startSequence(Ber.APPLICATION(22))
	if (invocation.id != null) {
		writer.startSequence(Ber.CONTEXT(0))
		writer.writeInt(invocation.id)
		writer.endSequence()
	}
	writer.startSequence(Ber.CONTEXT(1))
	writer.startSequence(Ber.BERDataTypes.SEQUENCE)
	for (var i = 0; i < invocation.args.length; i++) {
		writer.startSequence(Ber.CONTEXT(0))
		writer.writeValue(invocation.args[i]) // TODO - figure out what type of value to write
		writer.endSequence()
	}
	writer.endSequence()
	writer.endSequence()

	writer.endSequence() // BER.APPLICATION(22)
}
