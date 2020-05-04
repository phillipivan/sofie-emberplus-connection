export { Tree }

interface Tree<S, T extends S> {
	value: T
	parent?: Tree<S, S>
	children?: Array<Tree<S, S>>
	// TODO: insert all the usual tree manipulation methods
}

export class TreeImpl<S, T extends S> implements Tree<S, T> {
	constructor(
		public value: T,
		public parent?: Tree<S, S> | undefined,
		public children?: Array<Tree<S, S>>
	) { }
}
