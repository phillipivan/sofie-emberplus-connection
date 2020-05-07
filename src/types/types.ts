import { EmberElement } from '../model/EmberElement'
import { Function } from '../model/Function'
import { Qualified } from '../model/Qualified'
import { Parameter, ParameterType } from '../model/Parameter'
import { Template } from '../model/Template'
import { Matrix } from '../model/Matrix'
import { Node } from '../model/Node'
import { Tree } from '../model/Tree'
import { StreamEntry } from '../model/StreamEntry'
import { InvocationResult } from '../model/InvocationResult'

export {
	EmberTreeNode,
	EmberValue,
	EmberTypedValue,
	Root,
	RootElement,
	MinMax,
	StringIntegerCollection,
	RootType,
	RelativeOID
}

interface TreeElement<T extends EmberElement> {
	parent?: TreeElement<EmberElement>
	contents?: T
	children?: Array<NumberedTreeNode<EmberElement>>
}

interface NumberedTreeNode<T extends EmberElement> extends TreeElement<T> {
	number: number
}

interface QualifiedElement<T extends EmberElement> extends TreeElement<T> {
	path: RelativeOID
}

type EmberTreeNode<T extends EmberElement> = Tree<EmberElement, T>
type RootElement =
	| NumberedTreeNode<EmberElement>
	| QualifiedElement<Parameter>
	| QualifiedElement<Node>
	| QualifiedElement<Matrix>
	| QualifiedElement<Function>
	| QualifiedElement<Template>
type Root = Array<RootElement> | Array<StreamEntry> | InvocationResult

enum RootType {
	Elements,
	Streams,
	InvocationResult
}

// number is either Integer64 or REAL
type EmberValue = number | string | boolean | Buffer | null
interface EmberTypedValue {
	type: ParameterType
	value: EmberValue
}

type MinMax = number | null
type StringIntegerCollection = Map<string, number>
type RelativeOID = string
