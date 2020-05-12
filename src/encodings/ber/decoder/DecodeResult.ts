import { literal } from '../../../types/types'

export {
	DecodeOptions,
	defaultDecode,
	DecodeResult,
	whatever,
	check,
	DecodeError,
	makeResult,
	unknownContext,
	safeSet,
	guarded,
	appendErrors,
	unexpected
}

/**
 * Control what cuases an exception during decoding.
 */
interface DecodeOptions {
	/** Skip unknown application tags, used to identify objects. */
	skipApplicationTags: boolean
	/** Skip unknown context tags, used to identify the properties of objects. */
	skipContextTags: boolean
	/** Substitute a default value when a required value is missing. */
	substituteForRequired: boolean
	/** Skip past unexpected enumeration values. */
	skipUnexpected: boolean
}

/**
 * Default decoding values. Prevents throwing exceptions while decoding.
 */
const defaultDecode = literal<DecodeOptions>({
	skipApplicationTags: true,
	skipContextTags: true,
	substituteForRequired: true,
	skipUnexpected: true
})

/**
 * Decoders are forgiving and return both a candidate value and a list of
 * errors found in the source data.
 */
interface DecodeResult<T> {
	/** Candicate decoded value. */
	value: T
	/** List of errors, if any, found during decoding. */
	errors?: Array<Error>
}

/**
 * Return the decoded result whatever errors are reported.
 * @param decres Result of decoding.
 * @returns Candidate result of decoding, ignoring any errors.
 */
function whatever<T>(decres: DecodeResult<T>): T {
	return decres.value
}

class DecodeError extends Error {
	public readonly sub: Array<Error>
	constructor(errors: Array<Error>) {
		super(`Decoding failed. Errors are:\n${errors.join('\n')}`)
		this.sub = errors
	}
}

/**
 * Return the decoded result if no errors, otherwise throw a summary error.
 * @param decres Result of decoding.
 * @returns Candidate result of decoding, only if no errors.
 * @throws Summary when errors exists.
 */
function guarded<T>(decres: DecodeResult<T>): T {
	if (decres.errors && decres.errors.length > 0) {
		throw new DecodeError(decres.errors)
	}
	return decres.value
}

/**
 * Make a decoded result from an initial value with an empty list if errors.
 * @param t Value to embed in the initial result.
 */
function makeResult<T>(t: T, errors?: Array<Error>): DecodeResult<T> {
	return literal<DecodeResult<T>>({
		value: t,
		errors: Array.isArray(errors) ? errors : []
	})
}

/**
 * Process a decoding problem when a context parameter tag is not recognized.
 * @param decres Decoding result to add the error to (if appropriate).
 * @param context Description of the context.
 * @param tag Unrecognized tag.
 * @param options Control the processing of the error.
 */
function unknownContext<T>(
	decres: DecodeResult<T> | Array<Error>,
	context: string,
	tag: number | null,
	options: DecodeOptions = defaultDecode
): void {
	const err = new Error(`${context}: Unexpected BER tag '${tag}'`)
	let errors = Array.isArray(decres) ? decres : decres.errors
	if (options.skipContextTags) {
		if (!errors) {
			errors = []
		}
		errors.push(err)
	} else {
		throw err
	}
}

function safeSet<S, T>(
	result: DecodeResult<S>,
	update: DecodeResult<T>,
	fn: (s: S, t: T) => T
): DecodeResult<T> {
	if (result.errors && result.errors.length > 0) {
		update.errors = update.errors ? update.errors.concat(result.errors) : result.errors
	} else {
		update.value = fn(result.value, update.value)
	}
	return update
}

function check<T>(
	value: T | null | undefined,
	context: string,
	propertyName: string,
	substitute: T,
	decres: DecodeResult<T> | Array<Error>,
	options: DecodeOptions = defaultDecode
): T {
	if (value === null || value === undefined) {
		const errMsg = `${context}: For required property '${propertyName}', value is missing.`
		if (options.substituteForRequired) {
			let errors = Array.isArray(decres) ? decres : decres.errors
			if (!errors) {
				errors = []
			}
			errors.push(new Error(errMsg + `Substituting '${substitute}`))
			return substitute
		} else {
			throw new Error(errMsg)
		}
	}
	return value
}

function appendErrors<T, U>(source: DecodeResult<T>, decres: DecodeResult<U> | Array<Error>): T {
	if (source.errors && source.errors.length > 0) {
		if (Array.isArray(decres)) {
			decres.push(...source.errors)
		} else {
			decres.errors = decres.errors ? decres.errors.concat() : source.errors
		}
	}
	return source.value
}

function unexpected<T>(
	decres: DecodeResult<T> | Array<Error>,
	context: string,
	message = '',
	substitute: T,
	options: DecodeOptions = defaultDecode
): DecodeResult<T> {
	let errors = Array.isArray(decres) ? decres : decres.errors
	const err = new Error(`${context}${message ? ': ' + message : ''}`)
	if (options.skipUnexpected) {
		if (!errors) {
			errors = []
		}
		errors.push(err)
		return Array.isArray(decres) ? makeResult(substitute, errors) : decres
	} else {
		throw err
	}
}
