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

export class NodeImpl implements Node {
	public readonly type: ElementType.Node = ElementType.Node
	constructor(
		public number: number,
		public identifier?: string,
		public description?: string,
		public isRoot?: boolean,
		public isOnline?: boolean,
		public schemaIdentifiers?: string,
		public templateReference?: RelativeOID<Template>
	) { }
}
