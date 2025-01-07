"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.decodeLabel = void 0;
const tslib_1 = require("tslib");
const Ber = tslib_1.__importStar(require("../../../Ber"));
const Label_1 = require("../../../model/Label");
const constants_1 = require("../constants");
const DecodeResult_1 = require("./DecodeResult");
function decodeLabel(reader, options = DecodeResult_1.defaultDecode) {
    reader.readSequence(constants_1.LabelBERID);
    let basePath = null;
    let description = null;
    const errors = [];
    const endOffset = reader.offset + reader.length;
    while (reader.offset < endOffset) {
        const tag = reader.readSequence();
        switch (tag) {
            case Ber.CONTEXT(0):
                basePath = reader.readRelativeOID(Ber.BERDataTypes.RELATIVE_OID);
                break;
            case Ber.CONTEXT(1):
                description = reader.readString(Ber.BERDataTypes.STRING);
                break;
            case 0:
                break; // indefinite length
            default:
                (0, DecodeResult_1.unknownContext)(errors, 'decode label', tag, options);
                (0, DecodeResult_1.skipNext)(reader);
                break;
        }
    }
    basePath = (0, DecodeResult_1.check)(basePath, 'decode label', 'basePath', '', errors, options);
    description = (0, DecodeResult_1.check)(description, 'decode label', 'description', '', errors, options);
    return (0, DecodeResult_1.makeResult)(new Label_1.LabelImpl(basePath, description), errors);
}
exports.decodeLabel = decodeLabel;
//# sourceMappingURL=Label.js.map