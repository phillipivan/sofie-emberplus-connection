"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.decodeStringIntegerCollection = void 0;
const tslib_1 = require("tslib");
const Ber = tslib_1.__importStar(require("../../../Ber"));
const constants_1 = require("../constants");
const DecodeResult_1 = require("./DecodeResult");
function decodeStringIntegerCollection(reader, options = DecodeResult_1.defaultDecode) {
    reader.readSequence(constants_1.StringIntegerCollectionBERID);
    const collection = new Map();
    const errors = [];
    const endOffset = reader.offset + reader.length;
    while (reader.offset < endOffset) {
        const tag = reader.readSequence();
        if (tag === 0)
            continue;
        if (tag !== Ber.CONTEXT(0)) {
            (0, DecodeResult_1.unknownContext)(errors, 'decode string integer collection', tag, options);
            (0, DecodeResult_1.skipNext)(reader);
            continue;
        }
        const pair = (0, DecodeResult_1.appendErrors)(decodeStringIntegerPair(reader, options), errors);
        collection.set(pair.key, pair.value);
    }
    return (0, DecodeResult_1.makeResult)(collection, errors);
}
exports.decodeStringIntegerCollection = decodeStringIntegerCollection;
function decodeStringIntegerPair(reader, options = DecodeResult_1.defaultDecode) {
    let key = null;
    let value = null;
    const errors = [];
    reader.readSequence(constants_1.StringIntegerPairBERID);
    const endOffset = reader.offset + reader.length;
    while (reader.offset < endOffset) {
        const tag = reader.readSequence();
        switch (tag) {
            case Ber.CONTEXT(0):
                key = reader.readString(Ber.BERDataTypes.STRING);
                break;
            case Ber.CONTEXT(1):
                value = reader.readInt();
                break;
            case 0:
                break; // indefinite length
            default:
                (0, DecodeResult_1.unknownContext)(errors, 'deocde string integer pair', tag, options);
                (0, DecodeResult_1.skipNext)(reader);
                break;
        }
    }
    key = (0, DecodeResult_1.check)(key, 'decode string integer pair', 'key', `key${(Math.random() * 1000000) | 0}`, errors, options);
    value = (0, DecodeResult_1.check)(value, 'decode string integer pair', 'value', -1, errors, options);
    return (0, DecodeResult_1.makeResult)({ key, value }, errors);
}
//# sourceMappingURL=StringIntegerCollection.js.map