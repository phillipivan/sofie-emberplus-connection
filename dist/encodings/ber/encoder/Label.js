"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.encodeLabel = void 0;
const tslib_1 = require("tslib");
const Ber = tslib_1.__importStar(require("../../../Ber"));
const Errors_1 = require("../../../Errors");
const constants_1 = require("../constants");
function encodeLabel(label, writer) {
    writer.startSequence(constants_1.LabelBERID);
    if (label.basePath == null) {
        throw new Errors_1.InvalidEmberNode('', 'Missing label base path');
    }
    writer.startSequence(Ber.CONTEXT(0));
    writer.writeRelativeOID(label.basePath, Ber.BERDataTypes.RELATIVE_OID);
    writer.endSequence();
    if (label.description == null) {
        throw new Errors_1.InvalidEmberNode('', 'Missing label description');
    }
    writer.startSequence(Ber.CONTEXT(1));
    writer.writeString(label.description, Ber.BERDataTypes.STRING);
    writer.endSequence();
    writer.endSequence();
}
exports.encodeLabel = encodeLabel;
//# sourceMappingURL=Label.js.map