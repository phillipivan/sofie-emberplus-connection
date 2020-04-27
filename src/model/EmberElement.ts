export { ElementType, EmberElement, isEmberElement }

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

function isEmberElement(obj: any): obj is EmberElement {
	if (obj === undefined || obj === null) {
		return false
	}

	const { type, number } = obj

	if (!type || !Object.values(ElementType as any).includes(type)) {
		return false
	}

	if (typeof number !== 'number') {
		return false
	}

	return true
}
