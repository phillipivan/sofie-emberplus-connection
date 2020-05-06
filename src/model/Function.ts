import { EmberElement, ElementType } from './EmberElement'
import { RelativeOID } from './RelativeOID'
import { FunctionArgument } from './FunctionArgument'
import { Template } from './Template'

export { Function }

interface Function extends EmberElement {
	type: ElementType.Function
	identifier?: string
	description?: string
	args?: Array<FunctionArgument>
	result?: Array<FunctionArgument>
	templateReference?: RelativeOID<Template>
}
