import * as Ber from '../../Ber'
import { Command, CommandType, FieldFlags, SubscribeImpl,
	UnsubscribeImpl, GetDirectoryImpl, InvokeImpl } from '../../model/Command'
import { Invocation } from '../../model/Invocation'
import { decodeInvocation } from './Innvocation'

const CommandBERID = Ber.APPLICATION(2)

function readDirFieldMask(reader: Ber.Reader): FieldFlags | undefined {
	const intToMask: { [flag: number]: FieldFlags } = {
		[-2]: FieldFlags.Sparse,
		[-1]: FieldFlags.All,
		[ 0]: FieldFlags.Default,
		[ 1]: FieldFlags.Identifier,
		[ 2]: FieldFlags.Description,
		[ 3]: FieldFlags.Tree,
		[ 4]: FieldFlags.Value,
		[ 5]: FieldFlags.Connections
	}

	return intToMask[reader.readInt()]
}

export function decodeCommand(reader: Ber.Reader): Command {
	const ber = reader.getSequence(CommandBERID)
	let type: CommandType | null = null
	let dirFieldMask: FieldFlags | undefined = undefined
	let invocation: Invocation | undefined = undefined

	while (ber.remain > 0) {
		const tag = ber.peek()
		const seq = ber.getSequence(tag!)
		switch (tag) {
			case Ber.CONTEXT(0):
				type = seq.readInt()
				break
			case Ber.CONTEXT(1):
				dirFieldMask = readDirFieldMask(seq)
			  break
			case Ber.CONTEXT(2):
				invocation = decodeInvocation(seq)
			  break
			default:
			  throw new Error('Decode command: Unknown command property')
		}
	}
	if (type === null) {
		throw new Error('Decode command: Unknown command type')
	}
	switch (type) {
		case CommandType.Subscribe:
			return new SubscribeImpl()
		case CommandType.Unsubscribe:
			return new UnsubscribeImpl()
		case CommandType.GetDirectory:
			return new GetDirectoryImpl(dirFieldMask)
		case CommandType.Invoke:
			return new InvokeImpl(invocation)
		default:
			throw new Error('Decode command: Unmatched command type')
	}
}
