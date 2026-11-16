import { Writer } from '../../../Ber/index.js'
import { isQualified } from '../../../model/Tree.js'
import { QualifiedCommand, RootElement } from '../../../types/types.js'
import { encodeQualifedElement, encodeQualifiedCommand } from './Qualified.js'
import { encodeNumberedElement } from './Tree.js'

export function encodeRootElement(el: RootElement | QualifiedCommand, writer: Writer): void {
	if ('command' in el) {
		encodeQualifiedCommand(el, writer)
	} else if (isQualified(el)) {
		encodeQualifedElement(el, writer)
	} else {
		encodeNumberedElement(el, writer)
	}
}
