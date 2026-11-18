import { GetDirectoryImpl, InvokeImpl } from '../../../model/Command.js'
import { ConnectionDisposition, ConnectionImpl, ConnectionOperation } from '../../../model/Connection.js'
import { EmberFunctionImpl } from '../../../model/EmberFunction.js'
import { EmberNodeImpl } from '../../../model/EmberNode.js'
import { FunctionArgumentImpl } from '../../../model/FunctionArgument.js'
import { InvocationImpl } from '../../../model/Invocation.js'
import { InvocationResultImpl } from '../../../model/InvocationResult.js'
import { LabelImpl } from '../../../model/Label.js'
import { connectionsOf, MatrixAddressingMode, MatrixImpl, MatrixType, signalsOf } from '../../../model/Matrix.js'
import { ParameterAccess, ParameterImpl, ParameterType } from '../../../model/Parameter.js'
import { StreamDescriptionImpl, StreamFormat } from '../../../model/StreamDescription.js'
import { StreamEntryImpl } from '../../../model/StreamEntry.js'
import { TemplateImpl } from '../../../model/Template.js'
import { NumberedTreeNodeImpl, QualifiedElementImpl } from '../../../model/Tree.js'
import { RootType } from '../../../types/types.js'
import { berEncode } from '../index.js'
import { toIndefiniteLength } from './indefiniteLength.js'

// Messages that between them use every decoder: nodes, parameters with every kind of field, matrices with labels,
// signals and connections, functions with arguments and results, templates, commands, stream entries and an
// invocation result; numbered and qualified
export function messages(): Array<[string, Buffer]> {
	const parameter = new ParameterImpl(
		ParameterType.Enum,
		'mode',
		'Mode',
		1,
		3,
		0,
		ParameterAccess.ReadWrite,
		'%d',
		'off\non',
		1,
		true,
		'$*2\n$/2',
		1,
		0,
		5,
		new Map([
			['off', 0],
			['on', 1],
		]),
		new StreamDescriptionImpl(StreamFormat.Int16BE, 2),
		'schema',
		'1.9'
	)
	const matrix = new MatrixImpl(
		'router',
		signalsOf([0, 1, 2]),
		signalsOf([0, 1]),
		connectionsOf([
			new ConnectionImpl(0, [1], ConnectionOperation.Absolute, ConnectionDisposition.Modified),
			new ConnectionImpl(2, []),
		]),
		'Router',
		MatrixType.NToN,
		MatrixAddressingMode.Linear,
		3,
		2,
		4,
		2,
		'1.2.3',
		7,
		[new LabelImpl('1.2.3.1', 'Primary')],
		'schema',
		'1.9'
	)
	const fn = new EmberFunctionImpl(
		'add',
		'Add',
		[new FunctionArgumentImpl(ParameterType.Integer, 'a'), new FunctionArgumentImpl(ParameterType.Real, 'b')],
		[new FunctionArgumentImpl(ParameterType.Real, 'sum')]
	)
	const tree = berEncode(
		[
			new NumberedTreeNodeImpl(1, new EmberNodeImpl('device', 'Device', true, true), {
				1: new NumberedTreeNodeImpl(1, parameter),
				2: new NumberedTreeNodeImpl(2, matrix),
				3: new NumberedTreeNodeImpl(3, fn, {
					0: new NumberedTreeNodeImpl(
						0,
						new InvokeImpl(
							new InvocationImpl(9, [
								{ type: ParameterType.Integer, value: 2 },
								{ type: ParameterType.Real, value: 0.5 },
							])
						)
					),
				}),
				4: new NumberedTreeNodeImpl(4, new TemplateImpl(new NumberedTreeNodeImpl(0, parameter), 'T')),
			}),
		],
		RootType.Elements
	)
	const qualified = berEncode(
		[
			new QualifiedElementImpl('1.1', parameter),
			new QualifiedElementImpl('1.2', matrix),
			new QualifiedElementImpl('1.3', fn),
			new QualifiedElementImpl('1.4', new TemplateImpl(undefined, 'T')),
			new QualifiedElementImpl('1', new EmberNodeImpl('device'), {
				0: new NumberedTreeNodeImpl(0, new GetDirectoryImpl()),
			}),
		],
		RootType.Elements
	)
	const streams = berEncode(
		[
			new StreamEntryImpl(1, { type: ParameterType.Integer, value: -3 }),
			new StreamEntryImpl(2, { type: ParameterType.Real, value: 1.5 }),
			new StreamEntryImpl(3, { type: ParameterType.Octets, value: Buffer.from('0102', 'hex') }),
		],
		RootType.Streams
	)
	const result = berEncode(
		new InvocationResultImpl(9, true, [{ type: ParameterType.Real, value: 2.5 }]),
		RootType.InvocationResult
	)
	return [
		['a tree', tree],
		['a tree, indefinite lengths', toIndefiniteLength(tree)],
		['qualified elements', qualified],
		['qualified elements, indefinite lengths', toIndefiniteLength(qualified)],
		['stream entries', streams],
		['an invocation result', result],
	]
}
