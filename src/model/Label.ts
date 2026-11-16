import { RelativeOID } from '../types/types.js'

export { Label, LabelImpl, LabelSet }

/** Labelled nodes. */
interface Label {
	/** Absolute path to a node under which label parameters associated with signals reside. */
	basePath: RelativeOID
	/** Free-text description of the label. Used by consumers to let the user choose the label to display. */
	description: string
}

/**
 * A matrix's label set with its labels, as EmberClient.getMatrixLabels fetches it: the Label (where the labels are, and
 * the description a user chooses the set by), and each target's and source's label, by signal number
 */
interface LabelSet extends Label {
	targets: { [target: number]: string }
	sources: { [source: number]: string }
}

class LabelImpl implements Label {
	constructor(
		public basePath: RelativeOID,
		public description: string
	) {}
}
