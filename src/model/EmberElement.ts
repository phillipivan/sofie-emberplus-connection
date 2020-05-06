export { ElementType, EmberElement, isEmberElement }

/** Type specifyer for ember elements. */
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
	number?: number
	path?: string
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

export abstract class EmberElementImpl implements EmberElement {
	abstract type: ElementType
	constructor (
		private locator: number | string
	) { }
	get number(): number | undefined {
		return (typeof this.locator === 'number') ? this.locator : undefined
	}
	set number(n: number | undefined) { // don't allow unqualified to become qualified?
		if (!n) throw new Error(``)
		this.locator = n
	}
	get path(): string | undefined {
		return (typeof this.locator === 'string') ? this.locator : undefined
	}
	set path(s: string | undefined) {
		if (!s) throw new Error(``)
		this.locator = s
	}
}
