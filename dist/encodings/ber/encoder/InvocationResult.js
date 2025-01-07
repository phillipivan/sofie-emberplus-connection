"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.encodeInvocationResult = void 0;
const tslib_1 = require("tslib");
const Ber = tslib_1.__importStar(require("../../../Ber"));
const constants_1 = require("../constants");
function encodeInvocationResult(result, writer) {
    writer.startSequence(constants_1.InvocationResultBERID);
    if (result.id != null) {
        writer.startSequence(Ber.CONTEXT(0));
        writer.writeInt(result.id);
        writer.endSequence();
    }
    if (result.success != null) {
        writer.startSequence(Ber.CONTEXT(1));
        writer.writeBoolean(result.success);
        writer.endSequence();
    }
    if (result.result != null && result.result.length) {
        writer.startSequence(Ber.CONTEXT(2));
        writer.startSequence(Ber.BERDataTypes.SEQUENCE);
        for (let i = 0; i < result.result.length; i++) {
            writer.startSequence(Ber.CONTEXT(0));
            writer.writeValue(result.result[i]);
            writer.endSequence();
        }
        writer.endSequence();
        writer.endSequence();
    }
    writer.endSequence(); // InvocationResultBERID
}
exports.encodeInvocationResult = encodeInvocationResult;
//# sourceMappingURL=InvocationResult.js.map