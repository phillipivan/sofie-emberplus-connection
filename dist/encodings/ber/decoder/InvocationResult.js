"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.decodeInvocationResult = void 0;
const tslib_1 = require("tslib");
const Ber = tslib_1.__importStar(require("../../../Ber"));
const InvocationResult_1 = require("../../../model/InvocationResult");
const constants_1 = require("../constants");
const DecodeResult_1 = require("./DecodeResult");
function decodeInvocationResult(reader, options = DecodeResult_1.defaultDecode) {
    reader.readSequence(constants_1.InvocationResultBERID);
    let id = null;
    let success = undefined;
    let result = undefined;
    let seqOffset;
    const errors = [];
    const endOffset = reader.offset + reader.length;
    while (reader.offset < endOffset) {
        const tag = reader.readSequence();
        switch (tag) {
            case Ber.CONTEXT(0):
                id = reader.readInt();
                break;
            case Ber.CONTEXT(1):
                success = reader.readBoolean();
                break;
            case Ber.CONTEXT(2):
                result = [];
                reader.readSequence(Ber.BERDataTypes.SEQUENCE);
                seqOffset = reader.offset + reader.length;
                while (reader.offset < seqOffset) {
                    const resTag = reader.readSequence();
                    if (resTag === 0)
                        continue;
                    if (resTag === null || resTag !== Ber.CONTEXT(0)) {
                        (0, DecodeResult_1.unknownContext)(errors, 'decode invocation result: result', resTag, options);
                        (0, DecodeResult_1.skipNext)(reader);
                        continue;
                    }
                    result.push(reader.readValue());
                }
                break;
            case 0:
                break; // indefinite length
            default:
                (0, DecodeResult_1.unknownContext)(errors, 'decode invocation result', tag, options);
                (0, DecodeResult_1.skipNext)(reader);
                break;
        }
    }
    id = (0, DecodeResult_1.check)(id, 'decode invocation result', 'id', -1, errors, options);
    return (0, DecodeResult_1.makeResult)(new InvocationResult_1.InvocationResultImpl(id, success, result), errors);
}
exports.decodeInvocationResult = decodeInvocationResult;
//# sourceMappingURL=InvocationResult.js.map