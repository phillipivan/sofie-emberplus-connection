import { EmberTypedValue } from '../types/types'

export { InvocationResult }

interface InvocationResult {
	id: number
	success?: boolean
	result?: Array<EmberTypedValue>
}

export class InvocationResultImpl implements InvocationResult {
	constructor(
		public id: number,
		public success?: boolean,
		public result?: Array<EmberTypedValue>
	) { }
}
