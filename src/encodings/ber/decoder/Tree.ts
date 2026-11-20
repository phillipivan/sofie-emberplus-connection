import * as Ber from '../../../Ber/index.js'
import { Command } from '../../../model/Command.js'
import { ElementType, EmberElement } from '../../../model/EmberElement.js'
import { EmberNode, EmberNodeImpl } from '../../../model/EmberNode.js'
import { EmberFunction, EmberFunctionImpl, Parameter, ParameterImpl, ParameterType } from '../../../model/index.js'
import { Children, isNumbered, NumberedTreeNodeImpl, QualifiedElementImpl } from '../../../model/Tree.js'
import { NumberedTreeNode, RelativeOID, RootElement } from '../../../types/types.js'
import {
	CommandBERID,
	ElementCollectionBERID,
	FunctionBERID,
	MatrixBERID,
	NodeBERID,
	ParameterBERID,
	QualifiedFunctionBERID,
	QualifiedMatrixBERID,
	QualifiedNodeBERID,
	QualifiedParameterBERID,
	QualifiedTemplateBERID,
	RootElementsBERID,
	TemplateBERID,
} from '../constants.js'
import { decodeCommand } from './Command.js'
import {
	addError,
	appendErrors,
	DecodeOptions,
	DecodeResult,
	defaultDecode,
	makeResult,
	missing,
	skipNext,
	skipTooDeep,
	unexpected,
	unknownApplication,
	unknownContext,
} from './DecodeResult.js'
import { decodeFunctionContent } from './EmberFunction.js'
import { decodeNode } from './EmberNode.js'
import { decodeMatrix } from './Matrix.js'
import { decodeParameter } from './Parameter.js'
import { decodeTemplate } from './Template.js'

/** @param depth how deep the element whose children these are is below the message's own elements */
export function decodeChildren(
	reader: Ber.Reader,
	options: DecodeOptions = defaultDecode,
	depth = 0
): DecodeResult<Children> {
	reader.readSequence(ElementCollectionBERID)
	const kids = makeResult<Children>(new Map())

	const endOffset = reader.offset + reader.length
	while (reader.offset < endOffset) {
		const tag = reader.readSequence()
		if (tag === 0) continue
		if (skipTooDeep(reader, depth + 1, kids, 'decode children')) continue
		const kid = appendErrors(decodeGenericElement(reader, options, depth + 1), kids)
		// The children are numbered elements (the DTD's ElementCollection): a qualified one has no number to go by
		if (!isNumbered(kid)) {
			unexpected(
				kids,
				'decode children',
				`qualified element ${kid.path} is not a child: skipped`,
				kids.value,
				options
			)
			continue
		}
		if (skipUnaddressable(kid, kids, 'decode children', options)) continue
		// An ElementCollection may give a number twice: it is kept once, the later element
		if (kids.value.has(kid.number))
			addError(kids, new Error(`decode children: child ${kid.number} is listed more than once`))
		kids.value.set(kid.number, kid)
	}

	return kids
}

/** @param depth how deep the element is below the message's own elements, which are at 0 */
export function decodeGenericElement(
	reader: Ber.Reader,
	options: DecodeOptions = defaultDecode,
	depth = 0
): DecodeResult<RootElement> {
	const tag = reader.peek()
	const errors = new Array<Error>()

	if (tag === null) {
		unknownApplication(errors, 'decode generic element', tag, options)
		skipNext(reader)
		return makeResult(new NumberedTreeNodeImpl(-1, new EmberNodeImpl()), errors)
	}
	const isQualified = isTagQualified(tag)
	const type = appendErrors(tagToElType(tag, options), errors)

	if (tag === MatrixBERID || tag === QualifiedMatrixBERID) {
		return decodeMatrix(reader, isQualified, options, depth)
	}
	if (tag === TemplateBERID || tag === QualifiedTemplateBERID) {
		return decodeTemplate(reader, isQualified, options, depth)
	} else if (tag === CommandBERID) {
		const commandResult: DecodeResult<Command> = decodeCommand(reader, options)
		return makeResult(
			new NumberedTreeNodeImpl(commandResult.value.number, commandResult.value),
			commandResult.errors
		)
	}

	reader.readSequence(tag)
	let path: RelativeOID | null = null
	let number: number | null = null
	let contents: EmberNode | Parameter | EmberFunction | undefined = undefined
	let children: Children | undefined

	const endOffset = reader.offset + reader.length
	while (reader.offset < endOffset) {
		const tag = reader.readSequence()
		switch (tag) {
			case Ber.CONTEXT(0):
				if (isQualified) {
					path = reader.readRelativeOID()
				} else {
					number = reader.readInt()
				}
				break
			case Ber.CONTEXT(1):
				// parse contents
				switch (type) {
					case ElementType.Command:
						unknownApplication(errors, 'decode generic element: command is not generic', tag, options)
						// contents = new EmberNodeImpl()
						skipNext(reader)
						break
					case ElementType.Function:
						contents = appendErrors(decodeFunctionContent(reader, options), errors)
						break
					case ElementType.Matrix:
						unknownApplication(errors, 'decode generic element: matrix is not generic', tag, options)
						// contents = new EmberNodeImpl()
						skipNext(reader)
						break
					case ElementType.Node:
						contents = appendErrors(decodeNode(reader, options), errors)
						break
					case ElementType.Parameter:
						contents = appendErrors(decodeParameter(reader, options), errors)
						break
					case ElementType.Template:
						unknownApplication(errors, 'decode generic element: template is not generic', tag, options)
						// contents = new EmberNodeImpl()
						skipNext(reader)
						break
					default:
						unknownApplication(errors, 'decode generic element', tag, options)
						// contents = new EmberNodeImpl()
						skipNext(reader)
						break
				}
				break
			case Ber.CONTEXT(2):
				children = appendErrors(decodeChildren(reader, options, depth), errors)
				break
			case 0:
				break // indefinite length
			default:
				unknownContext(errors, 'decode generic element', tag, options)
				skipNext(reader)
				break
		}
	}

	if (!contents) {
		switch (type) {
			case ElementType.Node:
				contents = new EmberNodeImpl()
				break
			case ElementType.Parameter:
				contents = new ParameterImpl(ParameterType.Null)
				break
			case ElementType.Function:
				contents = new EmberFunctionImpl()
				break
			default:
				errors.push(new Error(`decodeGenericElement: No contents and unexpected type ${type}`))
				contents = new EmberNodeImpl()
				break
		}
	}

	let el: RootElement
	if (isQualified) {
		// Not made up: decodeRootElements skips a qualified element without a path, which addresses nothing
		if (path === null) missing('decode generic element', 'path', errors, options)
		el = new QualifiedElementImpl(path ?? '', contents, children)
	} else {
		// Not made up: decodeChildren and decodeRootElements skip an element without a number (-1), which addresses nothing
		if (number === null) missing('decode generic element', 'number', errors, options)
		el = new NumberedTreeNodeImpl(number ?? -1, contents, children)
	}

	if (children) {
		for (const kid of children.values()) {
			kid.parent = el
		}
	}

	return makeResult(el, errors)
}

export function decodeRootElements(
	reader: Ber.Reader,
	options: DecodeOptions = defaultDecode
): DecodeResult<Array<RootElement>> {
	reader.readSequence(RootElementsBERID)
	const rootEls = makeResult<Array<RootElement>>([])

	const endOffset = reader.offset + reader.length
	while (reader.offset < endOffset) {
		const tag = reader.readSequence()
		if (tag === 0) continue
		if (tag !== Ber.CONTEXT(0)) {
			unknownContext(rootEls, 'decode root elements', tag, options)
			skipNext(reader)
			continue
		}
		const rootEl = appendErrors(decodeGenericElement(reader, options), rootEls)
		// A qualified element is addressed by its path alone, so one without (missing, empty, or not an Ember+ path)
		// addresses nothing: it is skipped. Its path was '', which the client took as element 0, merging the element into
		// it, and the server too, applying a consumer's request to it. (The root is addressed by a command, never a path.)
		if (isNumbered(rootEl) && skipUnaddressable(rootEl, rootEls, 'decode root elements', options)) continue
		if (!isNumbered(rootEl) && rootEl.path === '') {
			unexpected(
				rootEls,
				'decode root elements',
				`a qualified ${rootEl.contents.type.toLowerCase()} without a path addresses no element: skipped`,
				rootEls.value,
				options
			)
			continue
		}
		// In the order they came, as many as came: an element's number or path is in the element, and a message may report
		// one element twice. (Keyed by number, one could replace another, and the order was lost.)
		rootEls.value.push(rootEl)
	}
	return rootEls
}

/**
 * Skips a numbered element, with an error, that no path can address: one without a number (decoded as -1) or with a
 * negative one, a path's numbers (a RELATIVE-OID's) being none of them negative. Such an element was kept, numbered as
 * it came or -1, and a client took it into its tree, where a request on it couldn't be encoded. A command, numbered by
 * its command type, is kept. Gives whether it skipped it.
 */
export function skipUnaddressable(
	element: NumberedTreeNode<EmberElement>,
	decres: DecodeResult<unknown> | Array<Error>,
	context: string,
	options: DecodeOptions
): boolean {
	if (element.number >= 0 || element.contents.type === ElementType.Command) return false
	const message = `a ${element.contents.type.toLowerCase()} numbered ${element.number}, which no path can address: skipped`
	unexpected(decres, context, message, Array.isArray(decres) ? undefined : decres.value, options)
	return true
}

function isTagQualified(tag: number): boolean {
	const qualifiedTags = new Set([
		QualifiedTemplateBERID,
		QualifiedParameterBERID,
		QualifiedNodeBERID,
		QualifiedMatrixBERID,
		QualifiedFunctionBERID,
	])

	return qualifiedTags.has(tag)
}

function tagToElType(tag: number, options: DecodeOptions = defaultDecode): DecodeResult<ElementType> {
	const tags = {
		[CommandBERID]: ElementType.Command,
		[FunctionBERID]: ElementType.Function,
		[NodeBERID]: ElementType.Node,
		[MatrixBERID]: ElementType.Matrix,
		[ParameterBERID]: ElementType.Parameter,
		[TemplateBERID]: ElementType.Template,
		[QualifiedTemplateBERID]: ElementType.Template,
		[QualifiedParameterBERID]: ElementType.Parameter,
		[QualifiedNodeBERID]: ElementType.Node,
		[QualifiedMatrixBERID]: ElementType.Matrix,
		[QualifiedFunctionBERID]: ElementType.Function,
	}

	if (!tags[tag]) {
		return unexpected([], 'tag to element type', `Unexpected element type tag '${tag}'`, ElementType.Node, options)
	}

	return makeResult(tags[tag])
}
