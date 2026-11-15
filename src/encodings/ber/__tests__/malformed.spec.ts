import vm from 'vm'

import { GetDirectoryImpl, InvokeImpl } from '../../../model/Command.js'
import { ConnectionDisposition, ConnectionImpl, ConnectionOperation } from '../../../model/Connection.js'
import { EmberFunctionImpl } from '../../../model/EmberFunction.js'
import { EmberNodeImpl } from '../../../model/EmberNode.js'
import { FunctionArgumentImpl } from '../../../model/FunctionArgument.js'
import { InvocationImpl } from '../../../model/Invocation.js'
import { InvocationResultImpl } from '../../../model/InvocationResult.js'
import { LabelImpl } from '../../../model/Label.js'
import { MatrixAddressingMode, MatrixImpl, MatrixType } from '../../../model/Matrix.js'
import { ParameterAccess, ParameterImpl, ParameterType } from '../../../model/Parameter.js'
import { StreamDescriptionImpl, StreamFormat } from '../../../model/StreamDescription.js'
import { StreamEntryImpl } from '../../../model/StreamEntry.js'
import { TemplateImpl } from '../../../model/Template.js'
import { NumberedTreeNodeImpl, QualifiedElementImpl } from '../../../model/Tree.js'
import { RootType } from '../../../types/types.js'
import { berDecode, berEncode } from '../index.js'
import { toIndefiniteLength } from './indefiniteLength.js'

// A message from a peer can be anything. Decoding one must end, by returning or by throwing, however it is malformed.
// A decoder that loops forever takes the process down with it (#46), and a synchronous loop ignores jest's timeout,
// so each decode runs under vm's timeout, which interrupts running code.
function decodeEnds(message: Buffer): 'returned' | 'threw' | 'did not end' {
	try {
		vm.runInNewContext('decode()', { decode: () => berDecode(message) }, { timeout: 1000 })
		return 'returned'
	} catch (e) {
		// The timeout's error comes from the vm's own context, so it is no instance of this context's Error
		if ((e as { code?: unknown } | null)?.code === 'ERR_SCRIPT_EXECUTION_TIMEOUT') return 'did not end'
		return 'threw'
	}
}

// Messages that between them use every decoder: nodes, parameters with every kind of field, matrices with labels,
// signals and connections, functions with arguments and results, templates, commands, stream entries and an
// invocation result; numbered and qualified
function messages(): Array<[string, Buffer]> {
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
		[0, 1, 2],
		[0, 1],
		{
			0: new ConnectionImpl(0, [1], ConnectionOperation.Absolute, ConnectionDisposition.Modified),
			2: new ConnectionImpl(2, []),
		},
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

describe('decoding a malformed message ends', () => {
	// The messages themselves decode, so what follows tests the decoders, not the fixtures
	it.each(messages())('%s decodes as it is', (_, message) => {
		expect(berDecode(message).errors ?? []).toEqual([])
	})

	// A message that declares more content than it holds: every length the message's own bytes give runs on past its end
	it.each(messages())('%s, cut short at any length', (_, message) => {
		const hanging: number[] = []
		for (let length = 0; length < message.length; length++) {
			if (decodeEnds(message.subarray(0, length)) === 'did not end') hanging.push(length)
		}
		expect(hanging).toEqual([])
	})

	// Any one byte wrong: a tag, a length (too long, too short, long form, indefinite) or contents
	it.each(messages())('%s, with any one byte changed', (_, message) => {
		const hanging: string[] = []
		for (let i = 0; i < message.length; i++) {
			for (const value of [0x00, 0x01, 0x7f, 0x80, 0x81, 0x84, 0xff, message[i] ^ 0x01]) {
				const changed = Buffer.from(message)
				changed[i] = value
				if (decodeEnds(changed) === 'did not end') hanging.push(`byte ${i} = 0x${value.toString(16)}`)
			}
		}
		expect(hanging).toEqual([])
	})

	// The messages from #46, as found
	it.each(['60036b01', '60026b05', '60056b03a001ff'])('%s', (hex) => {
		expect(decodeEnds(Buffer.from(hex, 'hex'))).not.toBe('did not end')
	})

	// A stream entry whose REAL value has the length 84 80 00 03 a0: four length bytes that, read as a signed number,
	// give a negative length
	it('a value whose length bytes start with 0x80', () => {
		expect(
			decodeEnds(
				Buffer.from(
					'602f662da00c650aa003020101a1030201fda00e650ca003020102a1050984800003a00d650ba003020103a10404020102',
					'hex'
				)
			)
		).not.toBe('did not end')
	})
})
