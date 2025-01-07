"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.decodeInvocation = void 0;
const tslib_1 = require("tslib");
const Ber = tslib_1.__importStar(require("../../../Ber"));
const Invocation_1 = require("../../../model/Invocation");
const constants_1 = require("../constants");
const DecodeResult_1 = require("./DecodeResult");
function decodeInvocation(reader, options = DecodeResult_1.defaultDecode) {
    reader.readSequence(constants_1.InvocationBERID);
    let id = undefined;
    const args = [];
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
                reader.readSequence(Ber.BERDataTypes.SEQUENCE);
                seqOffset = reader.offset + reader.length;
                while (reader.offset < seqOffset) {
                    const tag = reader.readSequence();
                    if (tag === Ber.CONTEXT(0)) {
                        args.push(reader.readValue());
                    }
                    else {
                        (0, DecodeResult_1.unknownContext)(errors, 'decode invocation arguments', tag, options);
                        (0, DecodeResult_1.skipNext)(reader);
                    }
                }
                break;
            case 0:
                break; // indefinite length
            default:
                (0, DecodeResult_1.unknownContext)(errors, 'decode invocation', tag, options);
                (0, DecodeResult_1.skipNext)(reader);
                break;
        }
    }
    return (0, DecodeResult_1.makeResult)(new Invocation_1.InvocationImpl(id, args), errors);
}
exports.decodeInvocation = decodeInvocation;
//# sourceMappingURL=Invocation.js.map