export { ElementType, EmberElement }

enum ElementType {
	Parameter = 'PARAMETER',
	Node = 'NODE',
	Command = 'COMMAND',
	Matrix = 'MATRIX',
	Function = 'FUNCTION',
	Template = 'TEMPLATE'
}

interface EmberElement {
	type: ElementType
	number: number
}
