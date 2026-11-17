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
	check,
	DecodeOptions,
	DecodeResult,
	defaultDecode,
	makeResult,
	skipNext,
	skipTooDeep,
	unexpected,
	unknownContext,
} from './DecodeResult.js'
import { decodeGenericElement } from './Tree.js'

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
					element = templated
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
		path = check(path, 'decode template', 'path', '', errors, options)
		return makeResult(new QualifiedElementImpl(path, new TemplateImpl(element, description)), errors)
	} else {
		number = check(number, 'decode tempalte', 'number', -1, errors, options)
		return makeResult(new NumberedTreeNodeImpl(number, new TemplateImpl(element, description)), errors)
	}
}

type TemplateElement = NumberedTreeNode<Parameter | EmberNode | Matrix | EmberFunction>

function isTemplateElement(el: RootElement): el is TemplateElement {
	return isNumbered(el) && el.contents.type !== ElementType.Command && el.contents.type !== ElementType.Template
}

function describe(el: RootElement): string {
	return `${isNumbered(el) ? 'numbered' : 'qualified'} ${el.contents.type.toLowerCase()}`
}
