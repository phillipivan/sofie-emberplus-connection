"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.decodeFunctionContent = void 0;
const tslib_1 = require("tslib");
const Ber = tslib_1.__importStar(require("../../../Ber"));
// import { EmberFunction, EmberFunctionImpl } from '../../../model/EmberFunction'
const EmberFunction_1 = require("../../../model/EmberFunction");
const FunctionArgument_1 = require("./FunctionArgument");
const DecodeResult_1 = require("./DecodeResult");
function decodeFunctionContent(reader, options = DecodeResult_1.defaultDecode) {
    reader.readSequence(Ber.BERDataTypes.SET);
    let identifier = undefined;
    let description = undefined;
    let args = undefined;
    let result = undefined;
    let templateReference = undefined;
    let seqOffset;
    let resOffset;
    const errors = [];
    const endOffset = reader.offset + reader.length;
    while (reader.offset < endOffset) {
        const tag = reader.readSequence();
        switch (tag) {
            case Ber.CONTEXT(0):
                identifier = reader.readString(Ber.BERDataTypes.STRING);
                break;
            case Ber.CONTEXT(1):
                description = reader.readString(Ber.BERDataTypes.STRING);
                break;
            case Ber.CONTEXT(2):
                args = [];
                reader.readSequence(Ber.BERDataTypes.SEQUENCE);
                seqOffset = reader.offset + reader.length;
                while (reader.offset < seqOffset) {
                    const argTag = reader.readSequence();
                    if (argTag === 0)
                        continue; // indefinite length
                    if (argTag !== Ber.CONTEXT(0)) {
                        (0, DecodeResult_1.unknownContext)(errors, 'decode function content: arguments', argTag, options);
                        (0, DecodeResult_1.skipNext)(reader);
                        continue;
                    }
                    const argEl = (0, DecodeResult_1.appendErrors)((0, FunctionArgument_1.decodeFunctionArgument)(reader, options), errors);
                    args.push(argEl);
                }
                break;
            case Ber.CONTEXT(3):
                result = [];
                reader.readSequence(Ber.BERDataTypes.SEQUENCE);
                resOffset = reader.offset + reader.length;
                while (reader.offset < resOffset) {
                    const resTag = reader.readSequence();
                    if (resTag === 0)
                        continue; // indefinite length
                    if (resTag !== Ber.CONTEXT(0)) {
                        (0, DecodeResult_1.unknownContext)(errors, 'decode function content: result', resTag, options);
                        (0, DecodeResult_1.skipNext)(reader);
                        continue;
                    }
                    const resEl = (0, DecodeResult_1.appendErrors)((0, FunctionArgument_1.decodeFunctionArgument)(reader, options), errors);
                    result.push(resEl);
                }
                break;
            case Ber.CONTEXT(4):
                templateReference = reader.readRelativeOID(Ber.BERDataTypes.RELATIVE_OID);
                break;
            case 0:
                break; // Idefinite length
            default:
                (0, DecodeResult_1.unknownContext)(errors, 'decode function content', tag, options);
                (0, DecodeResult_1.skipNext)(reader);
                break;
        }
    }
    return (0, DecodeResult_1.makeResult)(new EmberFunction_1.EmberFunctionImpl(identifier, description, args, result, templateReference), errors);
}
exports.decodeFunctionContent = decodeFunctionContent;
//# sourceMappingURL=EmberFunction.js.map