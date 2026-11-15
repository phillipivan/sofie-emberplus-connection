import * as Ber from '../../../Ber/index.js'
import {
	Command,
	CommandType,
	FieldFlags,
	GetDirectoryImpl,
	InvokeImpl,
	SubscribeImpl,
	UnknownCommandImpl,
	UnsubscribeImpl,
} from '../../../model/Command.js'
import { Invocation } from '../../../model/Invocation.js'
import { CommandBERID } from '../constants.js'
import {
	appendErrors,
	check,
	DecodeOptions,
	DecodeResult,
	defaultDecode,
	makeResult,
	skipNext,
	unexpected,
	unknownContext,
} from './DecodeResult.js'
import { decodeInvocation } from './Invocation.js'

export { decodeCommand }

function readDirFieldMask(reader: Ber.Reader): FieldFlags | undefined {
	const intToMask: { [flag: number]: FieldFlags } = {
		[-2]: FieldFlags.Sparse,
		[-1]: FieldFlags.All,
		[0]: FieldFlags.Default,
		[1]: FieldFlags.Identifier,
		[2]: FieldFlags.Description,
		[3]: FieldFlags.Tree,
		[4]: FieldFlags.Value,
		[5]: FieldFlags.Connections,
	}

	const int = reader.readInt()
	if (typeof int !== 'number') return undefined

	return intToMask[int]
}

function decodeCommand(reader: Ber.Reader, options: DecodeOptions = defaultDecode): DecodeResult<Command> {
	reader.readSequence(CommandBERID)
	// The number as received: CommandType is a numeric enum, which would take any number
	let number: number | null = null
	let dirFieldMask: FieldFlags | undefined = undefined
	let invocation: Invocation | undefined = undefined
	const errors: Array<Error> = []
	const endOffset = reader.offset + reader.length
	while (reader.offset < endOffset) {
		const tag = reader.readSequence()
		switch (tag) {
			case Ber.CONTEXT(0):
				number = reader.readInt()
				break
			case Ber.CONTEXT(1):
				dirFieldMask = readDirFieldMask(reader)
				if (!dirFieldMask) {
					errors.push(new Error(`decode command: encounted unknown dir field mask`))
				}
				break
			case Ber.CONTEXT(2):
				invocation = appendErrors(decodeInvocation(reader, options), errors)
				break
			case 0:
				break // Indefinite lengths
			default:
				unknownContext(errors, 'decode command', tag, options)
				skipNext(reader)
				break
		}
	}
	// A command without a number, or with one the DTD doesn't define, is one this library doesn't know: Unknown, which a
	// provider ignores. (It was taken for a Subscribe, which subscribed the consumer to the element.)
	switch (number) {
		case CommandType.Subscribe:
			return makeResult(new SubscribeImpl(), errors)
		case CommandType.Unsubscribe:
			return makeResult(new UnsubscribeImpl(), errors)
		case CommandType.GetDirectory:
			return makeResult(new GetDirectoryImpl(dirFieldMask), errors)
		case CommandType.Invoke:
			return makeResult(new InvokeImpl(invocation), errors)
		case null:
			check(number, 'decode command', 'number', CommandType.Unknown, errors, options)
			return makeResult(new UnknownCommandImpl(), errors)
		default:
			return unexpected(
				errors,
				'decode command',
				`command type '${number}' is not recognized`,
				new UnknownCommandImpl(),
				options
			)
	}
}
