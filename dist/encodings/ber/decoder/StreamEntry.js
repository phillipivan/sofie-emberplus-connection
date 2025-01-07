"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.decodeStreamEntries = exports.decodeStreamEntry = void 0;
const tslib_1 = require("tslib");
const Ber = tslib_1.__importStar(require("../../../Ber"));
const StreamEntry_1 = require("../../../model/StreamEntry");
const types_1 = require("../../../types/types");
const constants_1 = require("../constants");
const DecodeResult_1 = require("./DecodeResult");
const Parameter_1 = require("../../../model/Parameter");
function decodeStreamEntries(reader, options = DecodeResult_1.defaultDecode) {
    reader.readSequence(constants_1.StreamEntriesBERID);
    const streamEntries = (0, DecodeResult_1.makeResult)([]);
    const endOffset = reader.offset + reader.length;
    while (reader.offset < endOffset) {
        const tag = reader.readSequence();
        if (tag === 0)
            continue;
        if (tag !== Ber.CONTEXT(0)) {
            (0, DecodeResult_1.unknownContext)(streamEntries, 'decode stream entries', tag, options);
            (0, DecodeResult_1.skipNext)(reader);
            continue;
        }
        const rootEl = decodeStreamEntry(reader);
        (0, DecodeResult_1.safeSet)(rootEl, streamEntries, (x, y) => {
            y.push(x);
            return y;
        });
    }
    return streamEntries;
}
exports.decodeStreamEntries = decodeStreamEntries;
function decodeStreamEntry(reader, options = DecodeResult_1.defaultDecode) {
    reader.readSequence(constants_1.StreamEntryBERID);
    let identifier = null;
    let value = null;
    const errors = [];
    const endOffset = reader.offset + reader.length;
    while (reader.offset < endOffset) {
        const tag = reader.readSequence();
        switch (tag) {
            case Ber.CONTEXT(0):
                identifier = reader.readInt();
                break;
            case Ber.CONTEXT(1):
                value = reader.readValue();
                // return the full stream for later processing
                break;
            case 0:
                break; // indefinite length
            default:
                (0, DecodeResult_1.unknownContext)(errors, 'decode stream entry', tag, options);
                (0, DecodeResult_1.skipNext)(reader);
                break;
        }
    }
    identifier = (0, DecodeResult_1.check)(identifier, 'decode stream entry', 'identifier', 0, errors, options);
    value = (0, DecodeResult_1.check)(value, 'decode stream entry', 'value', (0, types_1.literal)({ value: null, type: Parameter_1.ParameterType.Null }), errors, options);
    return (0, DecodeResult_1.makeResult)(new StreamEntry_1.StreamEntryImpl(identifier, value), errors);
}
exports.decodeStreamEntry = decodeStreamEntry;
//# sourceMappingURL=StreamEntry.js.map