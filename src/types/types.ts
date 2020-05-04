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
	RootType
}

type EmberTreeNode<T extends EmberElement> = Tree<EmberElement, T>
type RootElement =
	| EmberTreeNode<EmberElement>
	| Qualified<Parameter>
	| Qualified<Node>
	| Qualified<Matrix>
	| Qualified<Function>
	| Qualified<Template>
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
