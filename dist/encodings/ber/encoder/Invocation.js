"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.encodeInvocation = void 0;
const tslib_1 = require("tslib");
const Ber = tslib_1.__importStar(require("../../../Ber"));
const constants_1 = require("../constants");
function encodeInvocation(invocation, writer) {
    writer.startSequence(constants_1.InvocationBERID);
    if (invocation.id != null) {
        writer.startSequence(Ber.CONTEXT(0));
        writer.writeInt(invocation.id);
        writer.endSequence();
    }
    writer.startSequence(Ber.CONTEXT(1));
    writer.startSequence(Ber.BERDataTypes.SEQUENCE);
    for (let i = 0; i < invocation.args.length; i++) {
        writer.startSequence(Ber.CONTEXT(0));
        writer.writeValue(invocation.args[i]);
        writer.endSequence();
    }
    writer.endSequence();
    writer.endSequence();
    writer.endSequence(); // InvocationBERID
}
exports.encodeInvocation = encodeInvocation;
//# sourceMappingURL=Invocation.js.map