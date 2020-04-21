import { EmberElement } from './EmberElement'
import { Tree } from './Tree'

export { RelativeOID }

interface RelativeOID<T extends EmberElement> {
	resolve(): Tree<T>
}
