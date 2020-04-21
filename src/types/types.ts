import { EmberElement } from '../model/EmberElement'
import { Function } from '../model/Function'
import { Qualified } from '../model/Qualified'
import { Parameter } from '../model/Parameter'
import { Template } from '../model/Template'
import { Matrix } from '../model/Matrix'
import { Node } from '../model/Node'
import { Tree } from '../model/Tree'
import { StreamEntry } from '../model/StreamEntry'
import { InvocationResult } from '../model/InvocationResult'

export { EmberTreeNode, EmberValue, Root, RootElement, MinMax, StringIntegerCollection }

type EmberTreeNode = Tree<EmberElement>
type RootElement =
	| EmberTreeNode
	| Qualified<Parameter>
	| Qualified<Node>
	| Qualified<Matrix>
	| Qualified<Function>
	| Qualified<Template>
type Root = Array<RootElement> | Array<StreamEntry> | InvocationResult

// number is either Integer64 or REAL
type EmberValue = number | string | boolean | Buffer | null
type MinMax = number | null
type StringIntegerCollection = Map<string, number>
