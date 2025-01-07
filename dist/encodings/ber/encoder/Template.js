"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.encodeTemplate = void 0;
const tslib_1 = require("tslib");
const Ber = tslib_1.__importStar(require("../../../Ber"));
const Tree_1 = require("./Tree");
function encodeTemplate(template, writer) {
    if (template.element != null) {
        writer.startSequence(Ber.CONTEXT(1));
        (0, Tree_1.encodeNumberedElement)(template.element, writer);
        writer.endSequence();
    }
    if (template.description != null) {
        writer.startSequence(Ber.CONTEXT(2));
        writer.writeString(template.description, Ber.BERDataTypes.STRING);
        writer.endSequence();
    }
}
exports.encodeTemplate = encodeTemplate;
//# sourceMappingURL=Template.js.map