import { EmberElement } from './EmberElement'
import { RelativeOID } from './RelativeOID'
import { Tree } from './Tree'

export { Qualified }

interface Qualified<T extends EmberElement> {
	value: Tree<T>
	path: string
	getRelativeOID(): RelativeOID<T>
}
