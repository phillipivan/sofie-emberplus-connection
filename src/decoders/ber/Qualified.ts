import * as Ber from '../../Ber'
import { EmberTreeNode } from '../../types/types'
import { EmberElement } from '../../model/EmberElement'
import { Qualified } from '../../model/Qualified'
import { RelativeOID } from '../../model/RelativeOID'

export function decodeQualified<T extends EmberElement>(
	reader: Ber.Reader,
	value: EmberTreeNode<T>,
	decodeContents: (reader: Ber.Reader) => T,
	makeQualified: (path: RelativeOID<T>, t: T, kids?: Array<EmberTreeNode<EmberElement>>) => 
	berid: number
): Qualified<EmberTreeNode<T>> {
	const ber = reader.getSequence(berid)
	let path: RelativeOID<T> | null = null
	while (ber.remain > 0) {
		const tag = ber.peek()
		const seq = ber.getSequence(tag!)
		switch (tag) {

		}
	}
}
