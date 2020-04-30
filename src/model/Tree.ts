export { Tree }

interface Tree<T> {
	value: T
	parent?: Tree<T>
	children?: Array<Tree<T>>
	// TODO: insert all the usual tree manipulation methods
}

export class TreeImpl<T> implements Tree<T> {
	constructor(
		public value: T,
		public parent?: Tree<T> | undefined,
		public children?: Array<Tree<T>>
	) { }
}
