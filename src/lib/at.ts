/**
 * The element of an array, buffer, table or collection at an index the caller has checked is there. A read outside it
 * throws, where it went on as undefined (or as 0, once a byte was masked): a check that let it through has gone wrong.
 */
export function at<T extends NonNullable<unknown>>(
	// Not a Map, which TypeScript would take for a table indexed by number: an index into one reads nothing
	collection: { readonly [index: number]: T; readonly length?: number; readonly get?: never },
	index: number
): T {
	const element = collection[index]
	if (element === undefined) {
		const size = collection.length === undefined ? '' : `, outside the ${collection.length} elements there are`
		throw new RangeError(`Nothing at ${index}${size}`)
	}
	return element
}
