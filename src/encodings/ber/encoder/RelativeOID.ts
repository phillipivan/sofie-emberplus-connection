import * as Ber from '../../../Ber'
import { RelativeOID } from '../../model/RelativeOID'
import { EmberElement } from '../../../model/EmberElement'

export function encodeRelativeOID<T extends EmberElement>(
	oid: RelativeOID<T>,
	writer: Ber.Writer
) {}
