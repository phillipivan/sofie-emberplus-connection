import * as Ber from '../../../Ber/index.js'
import { ElementType } from '../../../model/EmberElement.js'
import { EmberFunction } from '../../../model/EmberFunction.js'
import { EmberNode } from '../../../model/EmberNode.js'
import { Matrix } from '../../../model/Matrix.js'
import { Parameter } from '../../../model/Parameter.js'
import { Template, TemplateImpl } from '../../../model/Template.js'
import {
	isNumbered,
	NumberedTreeNode,
	NumberedTreeNodeImpl,
	QualifiedElement,
	QualifiedElementImpl,
} from '../../../model/Tree.js'
import { RelativeOID, RootElement } from '../../../types/types.js'
import { QualifiedTemplateBERID, TemplateBERID } from '../constants.js'
import {
	appendErrors,
	DecodeOptions,
	DecodeResult,
	defaultDecode,
	makeResult,
	missing,
	skipNext,
	skipTooDeep,
	unexpected,
	unknownContext,
} from './DecodeResult.js'
import { decodeGenericElement, skipUnaddressable } from './Tree.js'

/** @param depth how deep the template is below the message's own elements, which are at 0 */
export function decodeTemplate(
	reader: Ber.Reader,
	isQualified = false,
	options: DecodeOptions = defaultDecode,
	depth = 0
): DecodeResult<QualifiedElement<Template> | NumberedTreeNode<Template>> {
	reader.readSequence(isQualified ? QualifiedTemplateBERID : TemplateBERID)
	let number: number | null = null
	let path: RelativeOID | null = null
	let element: TemplateElement | undefined = undefined
	let description: string | undefined = undefined
	const errors: Array<Error> = []
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
			case Ber.CONTEXT(1): {
				// A parameter, node, matrix or function, numbered (the DTD's TemplateElement)
				if (skipTooDeep(reader, depth + 1, errors, 'decode template')) break
				const templated = appendErrors(decodeGenericElement(reader, options, depth + 1), errors)
				if (isTemplateElement(templated)) {
					// one without a number, or with a negative one, is not the template's: "The number of a template is
					// the number of its contained element definition"
					if (!skipUnaddressable(templated, errors, 'decode template', options)) element = templated
				} else {
					unexpected(
						errors,
						'decode template',
						`a ${describe(templated)} is not a templated element`,
						undefined,
						options
					)
				}
				break
			}
			case Ber.CONTEXT(2):
				description = reader.readString(Ber.BERDataTypes.STRING) ?? description
				break
			case 0:
				break // indefinite length
			default:
				unknownContext(errors, 'decode template', tag, options)
				skipNext(reader)
				break
		}
	}
	if (isQualified) {
		// Not made up: decodeRootElements skips a qualified element without a path, which addresses nothing
		if (path === null) missing('decode template', 'path', errors, options)
		return makeResult(new QualifiedElementImpl(path ?? '', new TemplateImpl(element, description)), errors)
	} else {
		// Not made up: decodeChildren and decodeRootElements skip a template without a number (-1), which addresses nothing
		if (number === null) missing('decode template', 'number', errors, options)
		return makeResult(new NumberedTreeNodeImpl(number ?? -1, new TemplateImpl(element, description)), errors)
	}
}

type TemplateElement = NumberedTreeNode<Parameter | EmberNode | Matrix | EmberFunction>

function isTemplateElement(el: RootElement): el is TemplateElement {
	return isNumbered(el) && el.contents.type !== ElementType.Command && el.contents.type !== ElementType.Template
}

function describe(el: RootElement): string {
	return `${isNumbered(el) ? 'numbered' : 'qualified'} ${el.contents.type.toLowerCase()}`
}
