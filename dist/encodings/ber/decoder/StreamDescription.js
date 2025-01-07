"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.decodeStreamDescription = void 0;
const tslib_1 = require("tslib");
const Ber = tslib_1.__importStar(require("../../../Ber"));
const StreamDescription_1 = require("../../../model/StreamDescription");
const constants_1 = require("../constants");
const DecodeResult_1 = require("./DecodeResult");
function decodeStreamDescription(reader, options = DecodeResult_1.defaultDecode) {
    reader.readSequence(constants_1.StreamDescriptionBERID);
    let format = null;
    let offset = null;
    const errors = [];
    const endOffset = reader.offset + reader.length;
    while (reader.offset < endOffset) {
        const tag = reader.readSequence();
        switch (tag) {
            case Ber.CONTEXT(0):
                format = (0, DecodeResult_1.appendErrors)(readStreamFormat(reader.readInt(), options), errors);
                break;
            case Ber.CONTEXT(1):
                offset = reader.readInt();
                break;
            case 0:
                break; // indefinite length
            default:
                (0, DecodeResult_1.unknownContext)(errors, 'decode stream description', tag, options);
                (0, DecodeResult_1.skipNext)(reader);
                break;
        }
    }
    format = (0, DecodeResult_1.check)(format, 'decode stream description', 'format', StreamDescription_1.StreamFormat.UInt8, errors, options);
    offset = (0, DecodeResult_1.check)(offset, 'decode stream description', 'offset', 0, errors, options);
    return (0, DecodeResult_1.makeResult)(new StreamDescription_1.StreamDescriptionImpl(format, offset), errors);
}
exports.decodeStreamDescription = decodeStreamDescription;
function readStreamFormat(value, options = DecodeResult_1.defaultDecode) {
    switch (value) {
        case 0:
            return (0, DecodeResult_1.makeResult)(StreamDescription_1.StreamFormat.UInt8);
        case 2:
            return (0, DecodeResult_1.makeResult)(StreamDescription_1.StreamFormat.UInt16BE);
        case 3:
            return (0, DecodeResult_1.makeResult)(StreamDescription_1.StreamFormat.UInt16LE);
        case 4:
            return (0, DecodeResult_1.makeResult)(StreamDescription_1.StreamFormat.UInt32BE);
        case 5:
            return (0, DecodeResult_1.makeResult)(StreamDescription_1.StreamFormat.UInt32LE);
        case 6:
            return (0, DecodeResult_1.makeResult)(StreamDescription_1.StreamFormat.UInt64BE);
        case 7:
            return (0, DecodeResult_1.makeResult)(StreamDescription_1.StreamFormat.UInt64LE);
        case 8:
            return (0, DecodeResult_1.makeResult)(StreamDescription_1.StreamFormat.Int8);
        case 10:
            return (0, DecodeResult_1.makeResult)(StreamDescription_1.StreamFormat.Int16BE);
        case 11:
            return (0, DecodeResult_1.makeResult)(StreamDescription_1.StreamFormat.Int16LE);
        case 12:
            return (0, DecodeResult_1.makeResult)(StreamDescription_1.StreamFormat.Int32BE);
        case 13:
            return (0, DecodeResult_1.makeResult)(StreamDescription_1.StreamFormat.Int32LE);
        case 14:
            return (0, DecodeResult_1.makeResult)(StreamDescription_1.StreamFormat.Int64BE);
        case 15:
            return (0, DecodeResult_1.makeResult)(StreamDescription_1.StreamFormat.Int64LE);
        case 20:
            return (0, DecodeResult_1.makeResult)(StreamDescription_1.StreamFormat.Float32BE);
        case 21:
            return (0, DecodeResult_1.makeResult)(StreamDescription_1.StreamFormat.Float32LE);
        case 22:
            return (0, DecodeResult_1.makeResult)(StreamDescription_1.StreamFormat.Float64BE);
        case 23:
            return (0, DecodeResult_1.makeResult)(StreamDescription_1.StreamFormat.Float64LE);
        default:
            return (0, DecodeResult_1.unexpected)([], 'read stream format', `unexpected stream format '${value}'`, StreamDescription_1.StreamFormat.UInt8, options);
    }
}
//# sourceMappingURL=StreamDescription.js.map