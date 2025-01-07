"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.decodeFunctionArgument = void 0;
const tslib_1 = require("tslib");
const Ber = tslib_1.__importStar(require("../../../Ber"));
const FunctionArgument_1 = require("../../../model/FunctionArgument");
const Parameter_1 = require("../../../model/Parameter");
const constants_1 = require("../constants");
const Parameter_2 = require("./Parameter");
const DecodeResult_1 = require("./DecodeResult");
function decodeFunctionArgument(reader, options = DecodeResult_1.defaultDecode) {
    reader.readSequence(constants_1.FunctionArgumentBERID);
    let type = null;
    let name = undefined;
    const errors = [];
    const endOffset = reader.offset + reader.length;
    while (reader.offset < endOffset) {
        const tag = reader.readSequence();
        switch (tag) {
            case Ber.CONTEXT(0):
                type = (0, DecodeResult_1.appendErrors)((0, Parameter_2.readParameterType)(reader.readInt(), options), errors);
                break;
            case Ber.CONTEXT(1):
                name = reader.readString(Ber.BERDataTypes.STRING);
                break;
            case 0:
                break; // indefinite length
            default:
                (0, DecodeResult_1.unknownContext)(errors, 'decode function context', tag, options);
                (0, DecodeResult_1.skipNext)(reader);
                break;
        }
    }
    type = (0, DecodeResult_1.check)(type, 'decode function argument', 'type', Parameter_1.ParameterType.Null, errors, options);
    return (0, DecodeResult_1.makeResult)(new FunctionArgument_1.FunctionArgumentImpl(type, name), errors);
}
exports.decodeFunctionArgument = decodeFunctionArgument;
//# sourceMappingURL=FunctionArgument.js.map