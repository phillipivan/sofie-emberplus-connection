import { RootElement } from '../../types/types'
import { Writer } from '../../Ber'
import { encodeTree } from './Tree'
import { encodeQualifedElement } from './Qualified'

export function encodeRootElement(el: RootElement, writer: Writer) {
	if ('path' in el) {
		encodeQualifedElement(el, writer)
	} else {
		encodeTree(el, writer)
	}
}
