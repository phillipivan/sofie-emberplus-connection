import { EmberValue } from '../types/types'

export { StreamEntry }

interface StreamEntry {
	identifier: number // Integer32
	value: EmberValue // not null
}
