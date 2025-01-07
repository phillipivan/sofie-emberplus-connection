"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StreamManager = void 0;
const eventemitter3_1 = require("eventemitter3");
const Parameter_1 = require("../../model/Parameter");
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
        Object.values(streamEntries).forEach((streamEntry) => {
            this.registeredStreams.forEach((streamInfo, path) => {
                // Only process if IDs match
                if (streamInfo.streamIdentifier === streamEntry.identifier) {
                    if (streamEntry.value) {
                        const value = streamEntry.value;
                        if (value.type === Parameter_1.ParameterType.Integer) {
                            // Handle direct integer values
                            this.updateStreamValue(path, value.value);
                        }
                        else if (value.type === Parameter_1.ParameterType.Octets && Buffer.isBuffer(value.value)) {
                            // Handle existing float32 buffer case
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
        console.log('\nCurrent Stream State:');
        console.log('Registered Streams:');
        this.registeredStreams.forEach((info, path) => {
            console.log(`  Path: ${path}`);
            console.log(`    Identifier: ${info.parameter.identifier}`);
            console.log(`    StreamId: ${info.parameter.streamIdentifier}`);
            console.log(`    Current Value: ${info.parameter.value}`);
        });
    }
}
exports.StreamManager = StreamManager;
//# sourceMappingURL=StreamManager.js.map