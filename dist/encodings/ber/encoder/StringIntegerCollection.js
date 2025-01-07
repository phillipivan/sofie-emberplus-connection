"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.encodeStringIntegerCollection = void 0;
const tslib_1 = require("tslib");
const Ber = tslib_1.__importStar(require("../../../Ber"));
const constants_1 = require("../constants");
function encodeStringIntegerCollection(collection, writer) {
    writer.startSequence(constants_1.StringIntegerCollectionBERID);
    for (const [key, value] of collection) {
        writer.startSequence(Ber.CONTEXT(0));
        writer.startSequence(constants_1.StringIntegerPairBERID);
        writer.startSequence(Ber.CONTEXT(0));
        writer.writeString(key, Ber.BERDataTypes.STRING);
        writer.endSequence();
        writer.startSequence(Ber.CONTEXT(1));
        writer.writeInt(value);
        writer.endSequence();
        writer.endSequence();
        writer.endSequence();
    }
    writer.endSequence();
}
exports.encodeStringIntegerCollection = encodeStringIntegerCollection;
//# sourceMappingURL=StringIntegerCollection.js.map