import { EmberTypedValue } from '../types/types.js'

export { InvocationResult, InvocationResultImpl }

/**
 *  Result of a function invocation, sent from provider to consumer.
 */
interface InvocationResult {
	/** Matches the invocation identifier */
	id: number
	/**
	 * True if no errors were encountered when executing the function. A provider may leave it out to mean true: a
	 * decoded result always has it, true then, as libember reads it.
	 */
	success?: boolean
	/** Return value of the function call, matching the expected result tyoes. */
	result?: Array<EmberTypedValue>
}

class InvocationResultImpl implements InvocationResult {
	constructor(
		public id: number,
		public success?: boolean,
		public result?: Array<EmberTypedValue>
	) {}
}
