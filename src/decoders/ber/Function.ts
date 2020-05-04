import * as Ber from '../../Ber'
import { Function, FunctionImpl } from '../../model/Function'
import { decodeFunctionArgument } from './FunctionArgument'

const FunctionBERID = 19

export function decodeFunction(reader: Ber.Reader): Function {
	const ber = reader.getSequence(FunctionBERID)
	let number: number | null = null
	let contents: Function | null = null
	while (ber.remain) {
		const tag = ber.peek()
		const seq = ber.getSequence(tag!)
		switch (tag) {
			case Ber.CONTEXT(0):
				number = seq.readInt()
			  break
			case Ber.CONTEXT(1):
				contents = decodeFunctionContent(seq)
				break
			case Ber.CONTEXT(2):
				// TODO decode children
			  break
			default:
			  throw new Error(``)
		}

	}
	if (number === null) {
		throw new Error(``)
	}
	if (contents === null) {
		return new FunctionImpl(number)
	}
	return new FunctionImpl(
		number,
		contents.identifier,
		contents.description,
		contents.args,
		contents.result,
		contents.templateReference)
}

export function decodeFunctionContent(reader: Ber.Reader): Function {
	let f: Function = {} as Function
	const ber = reader.getSequence(Ber.BERDataTypes.SET)
	while (ber.remain > 0) {
		const tag = ber.peek()
		const seq = ber.getSequence(tag!)
		switch (tag) {
			case Ber.CONTEXT(0):
				f.identifier = seq.readString(Ber.BERDataTypes.STRING)
				break
			case Ber.CONTEXT(1):
				f.description = seq.readString(Ber.BERDataTypes.STRING)
				break
			case Ber.CONTEXT(2):
				f.args = []
				const readArgSeq = seq.getSequence(Ber.BERDataTypes.SEQUENCE)
				while (readArgSeq.remain > 0) {
					const argTag = readArgSeq.peek() // TODO check this
					if (argTag !== Ber.CONTEXT(0)) {
						throw new Error(``)
					}
					const argSeq = readArgSeq.getSequence(Ber.CONTEXT(0))
					f.args.push(decodeFunctionArgument(argSeq))
				}
				break
			case Ber.CONTEXT(3):
				f.result = []
				let readResSeq = seq.getSequence(Ber.BERDataTypes.SEQUENCE)
				while (readResSeq.remain > 0) {
					const resTag = readResSeq.peek()
					if (resTag !== Ber.CONTEXT(0)) {
						throw new Error(``)
					}
					const resSeq = readResSeq.getSequence(Ber.CONTEXT(0))
					f.result.push(decodeFunctionArgument(resSeq))
				}
				break
			case Ber.CONTEXT(4):
				f.templateReference = seq.readRelativeOID(Ber.BERDataTypes.RELATIVE_OID)
				break
			default:
				throw new Error(``)
		}
	}

	return f
}
