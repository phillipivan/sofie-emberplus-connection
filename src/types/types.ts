import { EmberElement } from '../model/EmberElement'
import { EmberFunction } from '../model/EmberFunction'
import { Parameter, ParameterType } from '../model/Parameter'
import { Template } from '../model/Template'
import { Matrix } from '../model/Matrix'
import { EmberNode } from '../model/EmberNode'
import { StreamEntry } from '../model/StreamEntry'
import { InvocationResult } from '../model/InvocationResult'
import { Tree } from '../model/Tree'

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
	| QualifiedElement<EmberNode>
	| QualifiedElement<Matrix>
	| QualifiedElement<EmberFunction>
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
