"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.decodeTemplate = void 0;
const tslib_1 = require("tslib");
const Ber = tslib_1.__importStar(require("../../../Ber"));
const Template_1 = require("../../../model/Template");
const constants_1 = require("../constants");
const Tree_1 = require("./Tree");
const Tree_2 = require("../../../model/Tree");
const DecodeResult_1 = require("./DecodeResult");
function decodeTemplate(reader, isQualified = false, options = DecodeResult_1.defaultDecode) {
    reader.readSequence(isQualified ? constants_1.QualifiedTemplateBERID : constants_1.TemplateBERID);
    let number = null;
    let path = null;
    let element = undefined;
    let description = undefined;
    const errors = [];
    const endOffset = reader.offset + reader.length;
    while (reader.offset < endOffset) {
        const tag = reader.readSequence();
        switch (tag) {
            case Ber.CONTEXT(0):
                if (isQualified) {
                    path = reader.readRelativeOID();
                }
                else {
                    number = reader.readInt();
                }
                break;
            case Ber.CONTEXT(1):
                element = (0, DecodeResult_1.appendErrors)((0, Tree_1.decodeGenericElement)(reader, options), errors);
                break;
            case Ber.CONTEXT(2):
                description = reader.readString(Ber.BERDataTypes.STRING);
                break;
            case 0:
                break; // indefinite length
            default:
                (0, DecodeResult_1.unknownContext)(errors, 'decode template', tag, options);
                (0, DecodeResult_1.skipNext)(reader);
                break;
        }
    }
    if (isQualified) {
        path = (0, DecodeResult_1.check)(path, 'decode template', 'path', '', errors, options);
        return (0, DecodeResult_1.makeResult)(new Tree_2.QualifiedElementImpl(path, new Template_1.TemplateImpl(element, description)), errors);
    }
    else {
        number = (0, DecodeResult_1.check)(number, 'decode tempalte', 'number', -1, errors, options);
        return (0, DecodeResult_1.makeResult)(new Tree_2.NumberedTreeNodeImpl(number, new Template_1.TemplateImpl(element, description)), errors);
    }
}
exports.decodeTemplate = decodeTemplate;
//# sourceMappingURL=Template.js.map