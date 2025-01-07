"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.encodeRootElement = void 0;
const Tree_1 = require("./Tree");
const Qualified_1 = require("./Qualified");
function encodeRootElement(el, writer) {
    if ('path' in el) {
        (0, Qualified_1.encodeQualifedElement)(el, writer);
    }
    else {
        (0, Tree_1.encodeNumberedElement)(el, writer);
    }
}
exports.encodeRootElement = encodeRootElement;
//# sourceMappingURL=RootElement.js.map