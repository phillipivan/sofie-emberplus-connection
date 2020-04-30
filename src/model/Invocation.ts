import { EmberTypedValue } from '../types/types'

export { Invocation }

interface Invocation {
	id?: number // BER readInt
	args: Array<EmberTypedValue>
}

export class InvocationImpl implements Invocation {
	constructor(
		public id: number | undefined,
		public args: Array<EmberTypedValue>) { }
}
