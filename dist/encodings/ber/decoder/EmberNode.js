"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.decodeNode = void 0;
const tslib_1 = require("tslib");
const Ber = tslib_1.__importStar(require("../../../Ber"));
const EmberNode_1 = require("../../../model/EmberNode");
const DecodeResult_1 = require("./DecodeResult");
function decodeNode(reader, options = DecodeResult_1.defaultDecode) {
    reader.readSequence(Ber.BERDataTypes.SET);
    let identifier = undefined;
    let description = undefined;
    let isRoot = undefined;
    let isOnline = undefined;
    let schemaIdentifiers = undefined;
    let templateReference = undefined;
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
                isRoot = reader.readBoolean();
                break;
            case Ber.CONTEXT(3):
                isOnline = reader.readBoolean();
                break;
            case Ber.CONTEXT(4):
                schemaIdentifiers = reader.readString(Ber.BERDataTypes.STRING);
                break;
            case Ber.CONTEXT(5):
                templateReference = reader.readRelativeOID(Ber.BERDataTypes.RELATIVE_OID);
                break;
            case 0:
                break; // indefinite length
            default:
                (0, DecodeResult_1.unknownContext)(errors, 'deocde node', tag, options);
                (0, DecodeResult_1.skipNext)(reader);
                break;
        }
    }
    return (0, DecodeResult_1.makeResult)(new EmberNode_1.EmberNodeImpl(identifier, description, isRoot, isOnline, schemaIdentifiers, templateReference), errors);
}
exports.decodeNode = decodeNode;
//# sourceMappingURL=EmberNode.js.map