import { EmberElement, ElementType } from './EmberElement'
import { RelativeOID } from './RelativeOID'
import { Template } from './Template'

export { Node }

interface Node extends EmberElement {
	type: ElementType.Node
	identifier?: string
	description?: string
	isRoot?: boolean
	isOnline?: boolean
	schemaIdentifiers?: string
	templateReference?: RelativeOID<Template>
}
