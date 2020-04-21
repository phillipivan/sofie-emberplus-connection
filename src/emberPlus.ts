/**
 *  Draft Ember+ Typescript interface.
 */

function berEncode(el: EmberTreeNode): Buffer {
	return Buffer.alloc(0)
}

function berDecode(b: Buffer): EmberTreeNode {
	return null
}

function isValid(el: EmberTreeNode): boolean {
	return false
}

function toJSON(el: EmberTreeNode): Object {
	return null
}

function fromJSON(json: Object): EmberTreeNode {
	return null
}
