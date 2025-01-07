"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.encodeStreamEntry = void 0;
const tslib_1 = require("tslib");
const Ber = tslib_1.__importStar(require("../../../Ber"));
const constants_1 = require("../constants");
function encodeStreamEntry(entry, ber) {
    ber.startSequence(constants_1.StreamEntryBERID);
    if (entry.identifier !== null) {
        ber.startSequence(Ber.CONTEXT(0));
        ber.writeInt(entry.identifier);
        ber.endSequence();
    }
    if (entry.value !== null) {
        ber.startSequence(Ber.CONTEXT(1));
        ber.writeValue(entry.value);
        ber.endSequence();
    }
    ber.endSequence();
}
exports.encodeStreamEntry = encodeStreamEntry;
//# sourceMappingURL=StreamEntry.js.map