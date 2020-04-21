import { EmberValue } from '../types/types'

export { Invocation }

interface Invocation {
	id?: number // BER readInt
	args: Array<EmberValue>
}
