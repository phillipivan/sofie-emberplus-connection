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
        // Lookup by identifier for O(1) access
        this.streamsByIdentifier = new Map();
    }
    registerParameter(parameter, path) {
        if (!parameter.streamIdentifier) {
            debug('Warning: Attempted to register parameter without streamIdentifier');
            return;
        }
        // Check if already registered
        if (this.registeredStreams.has(path)) {
            debug('Stream already registered:', {
                path,
                identifier: parameter.streamIdentifier,
            });
            return;
        }
        const streamInfo = {
            parameter,
            path,
            streamIdentifier: parameter.streamIdentifier,
            offset: parameter.streamDescriptor?.offset || 0,
        };
        // Store both mappings
        this.registeredStreams.set(path, streamInfo);
        // Add to identifier lookup
        if (!this.streamsByIdentifier.has(parameter.streamIdentifier)) {
            this.streamsByIdentifier.set(parameter.streamIdentifier, new Set());
            debug('Registered new stream identifier and adding set:', parameter.streamIdentifier);
        }
        this.streamsByIdentifier.get(parameter.streamIdentifier)?.add(path);
        debug('Registered new stream:', {
            path,
            identifier: parameter.streamIdentifier,
            totalRegistered: this.registeredStreams.size,
        });
    }
    unregisterParameter(path) {
        const streamInfo = this.registeredStreams.get(path);
        if (streamInfo?.streamIdentifier) {
            // Clean up both maps
            this.registeredStreams.delete(path);
            const paths = this.streamsByIdentifier.get(streamInfo.streamIdentifier);
            if (paths) {
                paths.delete(path);
                if (paths.size === 0) {
                    this.streamsByIdentifier.delete(streamInfo.streamIdentifier);
                }
            }
            debug('Unregistered stream:', {
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
    updateStreamValues(streamEntries) {
        Object.values(streamEntries).forEach((streamEntry) => {
            // O(1) lookup by identifier
            const paths = this.streamsByIdentifier.get(streamEntry.identifier);
            if (!paths) {
                debug('Received update for unregistered stream:', streamEntry.identifier);
                return;
            }
            // Process each matching stream
            paths.forEach((path) => {
                const streamInfo = this.registeredStreams.get(path);
                if (!streamInfo || !streamEntry.value)
                    return;
                if (streamEntry.value.type === Parameter_1.ParameterType.Integer) {
                    this.updateStreamValue(path, streamEntry.value.value);
                }
                else if (streamEntry.value.type === Parameter_1.ParameterType.Octets && Buffer.isBuffer(streamEntry.value.value)) {
                    const buffer = streamEntry.value.value;
                    if (buffer.length >= streamInfo.offset + 4) {
                        const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.length);
                        const decodedValue = view.getFloat32(streamInfo.offset, true);
                        this.updateStreamValue(path, decodedValue);
                    }
                }
            });
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