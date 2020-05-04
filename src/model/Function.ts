import { EmberElement, ElementType } from './EmberElement'
import { RelativeOID } from './RelativeOID'
import { FunctionArgument } from './FunctionArgument'
import { Template } from './Template'

export { Function }

interface Function extends EmberElement {
	type: ElementType.Function
	identifier?: string
	description?: string
	args?: Array<FunctionArgument>
	result?: Array<FunctionArgument>
	templateReference?: RelativeOID<Template>
}

export class FunctionImpl implements Function {
	public readonly type: ElementType.Function = ElementType.Function
	constructor(
		public number: number,
		public identifier?: string,
		public description?: string,
		public args?: Array<FunctionArgument>,
		public result?: Array<FunctionArgument>,
		public templateReference?: RelativeOID<Template>
	) { }
}
