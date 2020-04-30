import { ElementType, EmberElement } from './EmberElement'
import { Invocation } from './Invocation'

export { CommandType, FieldFlags, Command, Subscribe, Unsubscribe, GetDirectory, Invoke }

enum CommandType {
	Subscribe = 30,
	Unsubscribe = 31,
	GetDirectory = 32,
	Invoke = 33
}

enum FieldFlags {
	Sparse = 'SPARSE',
	All = 'ALL',
	Default = 'DEFAULT',
	Identifier = 'IDENTIFIER',
	Description = 'DESCRIPTION',
	Tree = 'TREE',
	Value = 'VALUE',
	Connections = 'CONNECTIONS'
}

interface Command extends EmberElement {
	type: ElementType.Command
}

interface Subscribe extends Command {
	number: CommandType.Subscribe
}

interface Unsubscribe extends Command {
	number: CommandType.Unsubscribe
}

interface GetDirectory extends Command {
	number: CommandType.GetDirectory
	dirFieldMask?: FieldFlags
}

interface Invoke extends Command {
	number: CommandType.Invoke
	invocation?: Invocation
}

export function isInvoke(command: Command | null): command is Invoke {
	return command !== null && command.number === CommandType.Invoke
}

export function isGetDirectory(command: Command | null): command is GetDirectory {
	return command !== null && command.number === CommandType.GetDirectory
}

abstract class CommandImpl implements Command {
  public abstract number: number
	public type: ElementType.Command = ElementType.Command
	constructor() { }
}

export class SubscribeImpl extends CommandImpl implements Subscribe {
	public readonly number: CommandType.Subscribe = CommandType.Subscribe
	constructor() { super() }
}

export class UnsubscribeImpl extends CommandImpl implements Unsubscribe {
	public readonly number: CommandType.Unsubscribe = CommandType.Unsubscribe
	constructor() { super() }
}

export class GetDirectoryImpl extends CommandImpl implements GetDirectory {
	public readonly number: CommandType.GetDirectory = CommandType.GetDirectory

	constructor(public dirFieldMask?: FieldFlags) {
		super()
	}
}

export class InvokeImpl extends CommandImpl implements Invoke {
	public readonly number: CommandType.Invoke = CommandType.Invoke
	constructor(public invocation?: Invocation) {
		super()
	}
}
