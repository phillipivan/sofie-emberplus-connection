"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.encodeQualifedElement = void 0;
const tslib_1 = require("tslib");
const Ber = tslib_1.__importStar(require("../../../Ber"));
const EmberElement_1 = require("../../../model/EmberElement");
const Tree_1 = require("./Tree");
const constants_1 = require("../constants");
// note, this no longer encodes a full element, only the start
function encodeQualifedElement(el, writer) {
    switch (el.contents.type) {
        case EmberElement_1.ElementType.Function:
            writer.startSequence(constants_1.QualifiedFunctionBERID);
            break;
        case EmberElement_1.ElementType.Matrix:
            writer.startSequence(constants_1.QualifiedMatrixBERID);
            break;
        case EmberElement_1.ElementType.Node:
            writer.startSequence(constants_1.QualifiedNodeBERID);
            break;
        case EmberElement_1.ElementType.Parameter:
            writer.startSequence(constants_1.QualifiedParameterBERID);
            break;
        case EmberElement_1.ElementType.Template:
            writer.startSequence(constants_1.QualifiedTemplateBERID);
            break;
    }
    writer.startSequence(Ber.CONTEXT(0));
    writer.writeRelativeOID(el.path, Ber.BERDataTypes.RELATIVE_OID);
    writer.endSequence();
    (0, Tree_1.encodeTree)(el, writer);
}
exports.encodeQualifedElement = encodeQualifedElement;
//# sourceMappingURL=Qualified.js.map