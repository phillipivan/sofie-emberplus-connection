import { ParameterType } from './Parameter'

export { FunctionArgument }

interface FunctionArgument {
	type: ParameterType
	name: string
}

export class FunctionArgumentImpl implements FunctionArgument {
	constructor(
		public type: ParameterType,
		public name: string
	) { }
}
