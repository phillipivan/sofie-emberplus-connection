import * as Ber from '../../../Ber/index.js'
import { GetDirectoryImpl } from '../../../model/Command.js'
import { EmberNodeImpl } from '../../../model/EmberNode.js'
import { Template, TemplateImpl } from '../../../model/Template.js'
import {
	isNumbered,
	isQualified,
	NumberedTreeNodeImpl,
	QualifiedElementImpl,
	TreeElement,
} from '../../../model/Tree.js'
import { TemplateBERID } from '../constants.js'
import { defaultDecode, guarded } from '../decoder/DecodeResult.js'
import { decodeTemplate } from '../decoder/Template.js'
import { encodeQualifedElement } from '../encoder/Qualified.js'
import { encodeNumberedElement } from '../encoder/Tree.js'

describe('encodings/ber/Template', () => {
	function roundtripTemplate(tmpl: TreeElement<Template>, qualified = false): void {
		const writer = new Ber.Writer()
		if (isQualified(tmpl)) encodeQualifedElement(tmpl, writer)
		else if (isNumbered(tmpl)) encodeNumberedElement(tmpl, writer)
		expect(writer.buffer.length).toBeGreaterThan(0)
		const reader = new Ber.Reader(writer.buffer)
		const decoded = guarded(decodeTemplate(reader, qualified))

		expect(decoded).toEqual(tmpl)
	}

	function runRoundtripTests(qualified: boolean): void {
		test('description', () => {
			const template: Template = new TemplateImpl(undefined, 'Description')
			const node: TreeElement<Template> = qualified
				? new QualifiedElementImpl('1.2.3', template)
				: new NumberedTreeNodeImpl(0, template)
			roundtripTemplate(node, qualified)
		})

		test('element', () => {
			const template: Template = new TemplateImpl(new NumberedTreeNodeImpl(0, new EmberNodeImpl('TestNode')))
			const node: TreeElement<Template> = qualified
				? new QualifiedElementImpl('1.2.3', template)
				: new NumberedTreeNodeImpl(0, template)
			roundtripTemplate(node, qualified)
		})
	}

	// A template's element is a numbered parameter, node, matrix or function (the DTD's TemplateElement). Anything
	// else was kept as the element, cast to one.
	describe('an element that is not one to template', () => {
		const template = (writeElement: (w: Ber.Writer) => void) => {
			const w = new Ber.Writer()
			w.startSequence(TemplateBERID)
			w.startSequence(Ber.CONTEXT(0))
			w.writeInt(5)
			w.endSequence()
			w.startSequence(Ber.CONTEXT(1))
			writeElement(w)
			w.endSequence()
			w.endSequence()
			return new Ber.Reader(w.buffer)
		}
		test.each<[string, (w: Ber.Writer) => void]>([
			[
				'qualified node',
				(w) => encodeQualifedElement(new QualifiedElementImpl('1.2', new EmberNodeImpl('n')), w),
			],
			['numbered command', (w) => encodeNumberedElement(new NumberedTreeNodeImpl(32, new GetDirectoryImpl()), w)],
			['numbered template', (w) => encodeNumberedElement(new NumberedTreeNodeImpl(0, new TemplateImpl()), w)],
		])('a %s is left out, with an error', (kind, writeElement) => {
			const decoded = decodeTemplate(template(writeElement))

			expect(decoded.value).toEqual(new NumberedTreeNodeImpl(5, new TemplateImpl()))
			expect(decoded.errors.map((e) => e.message)).toEqual([
				`decode template: a ${kind} is not a templated element`,
			])
		})
		test('throws when unexpected values are not skipped', () => {
			const reader = template((w) => encodeNumberedElement(new NumberedTreeNodeImpl(0, new TemplateImpl()), w))

			expect(() => decodeTemplate(reader, false, { ...defaultDecode, skipUnexpected: false })).toThrow(
				'a numbered template is not a templated element'
			)
		})
	})

	describe('roundtrip numbered template', () => {
		runRoundtripTests(false)
	})
	describe('roundtrip qualified template', () => {
		runRoundtripTests(true)
	})
})
