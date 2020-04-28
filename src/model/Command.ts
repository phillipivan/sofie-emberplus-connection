import { ElementType, EmberElement } from './EmberElement'
import { Invocation } from './Invocation'

export { Command, CommandType, FieldFlags, Subscribe, Unsubscribe, GetDirectory, Invoke }

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
