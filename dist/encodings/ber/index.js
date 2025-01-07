"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.berDecode = exports.berEncode = void 0;
const tslib_1 = require("tslib");
const types_1 = require("../../types/types");
const Ber = tslib_1.__importStar(require("../../Ber"));
const InvocationResult_1 = require("./encoder/InvocationResult");
const RootElement_1 = require("./encoder/RootElement");
const StreamEntry_1 = require("./encoder/StreamEntry");
const InvocationResult_2 = require("./decoder/InvocationResult");
const Tree_1 = require("./decoder/Tree");
const StreamEntry_2 = require("./decoder/StreamEntry");
const DecodeResult_1 = require("./decoder/DecodeResult");
const constants_1 = require("./constants");
const Tree_2 = require("../../model/Tree");
const EmberNode_1 = require("../../model/EmberNode");
function berEncode(el, rootType) {
    const writer = new Ber.Writer();
    writer.startSequence(constants_1.RootBERID); // Start ROOT
    switch (rootType) {
        case types_1.RootType.Elements:
            writer.startSequence(constants_1.RootElementsBERID); // Start RootElementCollection
            for (const rootEl of Object.values(el)) {
                writer.startSequence(Ber.CONTEXT(0));
                (0, RootElement_1.encodeRootElement)(rootEl, writer);
                writer.endSequence();
            }
            writer.endSequence(); // End RootElementCollection
            break;
        case types_1.RootType.Streams:
            writer.startSequence(constants_1.StreamEntriesBERID); // Start StreamCollection
            for (const entry of Object.values(el)) {
                writer.startSequence(Ber.CONTEXT(0));
                (0, StreamEntry_1.encodeStreamEntry)(entry, writer);
                writer.endSequence();
            }
            writer.endSequence(); // End StreamCollection
            break;
        case types_1.RootType.InvocationResult:
            (0, InvocationResult_1.encodeInvocationResult)(el, writer);
            break;
    }
    writer.endSequence(); // End ROOT
    return writer.buffer;
}
exports.berEncode = berEncode;
function berDecode(b, options = DecodeResult_1.defaultDecode) {
    const reader = new Ber.Reader(b);
    const errors = new Array();
    const tag = reader.peek();
    if (tag !== constants_1.RootBERID) {
        (0, DecodeResult_1.unknownApplication)(errors, 'decode root', tag, options);
        return (0, DecodeResult_1.makeResult)([new Tree_2.NumberedTreeNodeImpl(-1, new EmberNode_1.EmberNodeImpl())], errors);
    }
    reader.readSequence(tag);
    const rootSeqType = reader.peek();
    if (rootSeqType === constants_1.RootElementsBERID) {
        // RootElementCollection
        const root = (0, Tree_1.decodeRootElements)(reader, options);
        return root;
    }
    else if (rootSeqType === constants_1.StreamEntriesBERID) {
        // StreamCollection
        const root = (0, StreamEntry_2.decodeStreamEntries)(reader, options);
        return root;
    }
    else if (rootSeqType === constants_1.InvocationResultBERID) {
        // InvocationResult
        const root = (0, InvocationResult_2.decodeInvocationResult)(reader, options);
        return root;
    }
    (0, DecodeResult_1.unknownApplication)(errors, 'decode root', rootSeqType, options);
    return (0, DecodeResult_1.makeResult)([new Tree_2.NumberedTreeNodeImpl(-1, new EmberNode_1.EmberNodeImpl())], errors);
}
exports.berDecode = berDecode;
//# sourceMappingURL=index.js.map