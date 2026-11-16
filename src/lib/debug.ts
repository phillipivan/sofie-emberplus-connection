import { format } from 'util'

import Debug from 'debug'

/** The `debug` namespaces this library logs under */
const NAMESPACES = 'emberplus-connection:*'

/** Where the library's debug messages go: a function taking each message as a string */
export type DebugLog = (message: string) => void

const toConsole: DebugLog = (message) => console.log(message)
let destination: DebugLog = toConsole

/**
 * A logger for a part of the library: the `debug` package's, under `emberplus-connection:<name>`, writing to where
 * setDebugLogging says
 */
export function makeDebug(name: string): Debug.Debugger {
	const debug = Debug(`emberplus-connection:${name}`)
	debug.log = (...args: Array<unknown>) => destination(format(...args))
	return debug
}

/**
 * Turns the library's debug logging (the `debug` package's `emberplus-connection:*` namespaces) on or off, at any time,
 * and says where its messages go: to `log`, such as an application's own logger, or else to `console.log`. Each message
 * is a string as `debug` formats it: the namespace, and, when not writing to a terminal, a timestamp before it (an
 * object in it, such as received data, may span several lines). Any
 * other namespaces enabled stay as they are; off holds even when every namespace (`*`) is enabled.
 *
 * Setting `process.env.DEBUG` once the library is loaded does nothing: `debug` reads it only once, as it loads, which
 * is when the library is imported. Calling `debug`'s own `enable()` works only with the very copy of `debug` the library
 * uses, which a different version installed alongside would not be.
 */
export function setDebugLogging(enabled: boolean, log?: DebugLog): void {
	destination = log ?? toConsole
	const isOurs = (namespace: string) => namespace.replace(/^-/, '').startsWith('emberplus-connection:')
	const others = Debug.disable()
		.split(',')
		.filter((namespace) => namespace !== '' && !isOurs(namespace))
	Debug.enable([...others, enabled ? NAMESPACES : `-${NAMESPACES}`].join(','))
}
