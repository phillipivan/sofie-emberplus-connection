import { EmberElement } from '../model/EmberElement.js'
import { EmberFunction } from '../model/EmberFunction.js'
import { EmberNode } from '../model/EmberNode.js'
import { InvocationResult } from '../model/InvocationResult.js'
import { Matrix } from '../model/Matrix.js'
import { Parameter, ParameterType } from '../model/Parameter.js'
import { StreamEntry } from '../model/StreamEntry.js'
import { Template } from '../model/Template.js'
import { NumberedTreeNode, QualifiedElement, TreeElement } from '../model/Tree.js'

export {
	TreeElement,
	NumberedTreeNode,
	QualifiedElement,
	EmberTreeNode,
	EmberValue,
	EmberTypedValue,
	Root,
	RootElement,
	MinMax,
	StringIntegerCollection,
	RootType,
	RelativeOID,
	literal,
	Collection,
}

type EmberTreeNode<T extends EmberElement> = NumberedTreeNode<T>
type RootElement =
	| NumberedTreeNode<EmberElement>
	| QualifiedElement<Parameter>
	| QualifiedElement<EmberNode>
	| QualifiedElement<Matrix>
	| QualifiedElement<EmberFunction>
	| QualifiedElement<Template>
type Root = Collection<RootElement> | Collection<StreamEntry> | InvocationResult

enum RootType {
	Elements,
	Streams,
	InvocationResult,
}

// number is either Integer64 or REAL
type EmberValue = number | string | boolean | Buffer | null
/**
 * A value with its type, as an invocation's arguments and result and a stream entry carry it. The value is of the
 * type's JavaScript form, or null (a null value, Glow 2.50, or one cut short in decoding). A trigger's value is written
 * by its own JavaScript type, so it may be any of them.
 */
type EmberTypedValue =
	| { type: ParameterType.Integer; value: number | null }
	| { type: ParameterType.Real; value: number | null }
	| { type: ParameterType.Enum; value: number | null }
	| { type: ParameterType.String; value: string | null }
	| { type: ParameterType.Boolean; value: boolean | null }
	| { type: ParameterType.Octets; value: Buffer | null }
	| { type: ParameterType.Null; value: null }
	| { type: ParameterType.Trigger; value: EmberValue }

type MinMax = number | null
type StringIntegerCollection = Map<string, number>
type RelativeOID = string

function literal<T>(arg: T): T {
	return arg
}

type Collection<T> = { [index: number]: T }
