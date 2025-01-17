"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StreamManager = void 0;
const tslib_1 = require("tslib");
const eventemitter3_1 = require("eventemitter3");
const Parameter_1 = require("../../model/Parameter");
const debug_1 = tslib_1.__importDefault(require("debug"));
const debug = (0, debug_1.default)('emberplus-connection:StreamManager');
class StreamManager extends eventemitter3_1.EventEmitter {
    constructor() {
        super();
        this.registeredStreams = new Map();
    }
    registerParameter(parameter, path) {
        if (!parameter.streamIdentifier) {
            return;
        }
        const offset = parameter.streamDescriptor?.offset || 0;
        const streamInfo = {
            parameter,
            path,
            streamIdentifier: parameter.streamIdentifier,
            offset: offset,
        };
        // Store both mappings
        this.registeredStreams.set(path, streamInfo);
        console.log('Registered stream:', {
            path: path,
            identifier: parameter.identifier,
            offset: offset,
        });
    }
    unregisterParameter(path) {
        const streamInfo = this.registeredStreams.get(path);
        if (streamInfo && streamInfo.parameter.streamIdentifier) {
            this.registeredStreams.delete(path);
            console.log('Unregistered stream:', {
                path: path,
                identifier: streamInfo.parameter.identifier,
            });
        }
    }
    getStreamInfoByPath(path) {
        return this.registeredStreams.get(path);
    }
    hasStream(identifier) {
        return this.registeredStreams.has(identifier);
    }
    updateAllStreamValues(streamEntries) {
        // Process each entry - works for both single and multiple entries
        Object.values(streamEntries).forEach((streamEntry) => {
            // Only process if we have a registered stream with this identifier
            let updatedStream = false;
            this.registeredStreams.forEach((streamInfo, path) => {
                // Only process if IDs match
                if (streamInfo.streamIdentifier === streamEntry.identifier) {
                    updatedStream = true;
                    if (streamEntry.value) {
                        const value = streamEntry.value;
                        if (value.type === Parameter_1.ParameterType.Integer) {
                            // Handle direct integer values
                            this.updateStreamValue(path, value.value);
                        }
                        else if (value.type === Parameter_1.ParameterType.Octets && Buffer.isBuffer(value.value)) {
                            // Handle float32 buffer case
                            const buffer = value.value;
                            if (buffer.length >= streamInfo.offset + 4) {
                                // Float32 is 4 bytes
                                const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.length);
                                // decode as little-endian
                                const decodedValue = view.getFloat32(streamInfo.offset, true);
                                this.updateStreamValue(path, decodedValue);
                            }
                        }
                    }
                }
            });
            if (!updatedStream) {
                debug('Received update for unregistered stream:', streamEntry.identifier);
            }
        });
    }
    updateStreamValue(path, value) {
        if (path) {
            const streamInfo = this.registeredStreams.get(path);
            if (streamInfo) {
                streamInfo.parameter.value = value;
                this.emit('streamUpdate', path, value);
            }
        }
    }
    getAllRegisteredPaths() {
        return Array.from(this.registeredStreams.keys());
    }
    // Debug helper
    printStreamState() {
        debug('\nCurrent Stream State:');
        debug('Registered Streams:');
        this.registeredStreams.forEach((info, path) => {
            debug(`  Path: ${path}`);
            debug(`    Identifier: ${info.parameter.identifier}`);
            debug(`    StreamId: ${info.parameter.streamIdentifier}`);
            debug(`    Current Value: ${info.parameter.value}`);
        });
    }
}
exports.StreamManager = StreamManager;
//# sourceMappingURL=StreamManager.js.map