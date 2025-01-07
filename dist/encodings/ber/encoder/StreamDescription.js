"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.encodeStreamDescription = void 0;
const tslib_1 = require("tslib");
const Ber = tslib_1.__importStar(require("../../../Ber"));
const StreamDescription_1 = require("../../../model/StreamDescription");
const constants_1 = require("../constants");
function encodeStreamDescription(description, writer) {
    writer.startSequence(constants_1.StreamDescriptionBERID);
    writer.writeIfDefined(description.format && formatToInt(description.format), writer.writeInt, 0, Ber.BERDataTypes.INTEGER);
    writer.writeIfDefined(description.offset, writer.writeInt, 1, Ber.BERDataTypes.INTEGER);
    writer.endSequence();
}
exports.encodeStreamDescription = encodeStreamDescription;
function formatToInt(format) {
    const formatToInt = {
        [StreamDescription_1.StreamFormat.UInt8]: 0,
        [StreamDescription_1.StreamFormat.UInt16BE]: 2,
        [StreamDescription_1.StreamFormat.UInt16LE]: 3,
        [StreamDescription_1.StreamFormat.UInt32BE]: 4,
        [StreamDescription_1.StreamFormat.UInt32LE]: 5,
        [StreamDescription_1.StreamFormat.UInt64BE]: 6,
        [StreamDescription_1.StreamFormat.UInt64LE]: 7,
        [StreamDescription_1.StreamFormat.Int8]: 8,
        [StreamDescription_1.StreamFormat.Int16BE]: 10,
        [StreamDescription_1.StreamFormat.Int16LE]: 11,
        [StreamDescription_1.StreamFormat.Int32BE]: 12,
        [StreamDescription_1.StreamFormat.Int32LE]: 13,
        [StreamDescription_1.StreamFormat.Int64BE]: 14,
        [StreamDescription_1.StreamFormat.Int64LE]: 15,
        [StreamDescription_1.StreamFormat.Float32BE]: 20,
        [StreamDescription_1.StreamFormat.Float32LE]: 21,
        [StreamDescription_1.StreamFormat.Float64BE]: 22,
        [StreamDescription_1.StreamFormat.Float64LE]: 23,
    };
    return formatToInt[format];
}
//# sourceMappingURL=StreamDescription.js.map