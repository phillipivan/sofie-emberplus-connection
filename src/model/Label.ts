export { Label }

interface Label {
	basePath: string // might be RelativeOID<?>
	description: string
}

export class LabelImpl implements Label {
	constructor(
		public basePath: string,
		public description: string
	) { }
}
