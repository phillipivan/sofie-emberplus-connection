export { Tree }

interface Tree<T> {
	value: T
	parent?: Tree<T>
	children?: Array<Tree<T>>
	// TODO: insert all the usual tree manipulation methods
}
