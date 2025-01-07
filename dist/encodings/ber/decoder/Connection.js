"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.decodeConnection = void 0;
const tslib_1 = require("tslib");
const Ber = tslib_1.__importStar(require("../../../Ber"));
const Connection_1 = require("../../../model/Connection");
const constants_1 = require("../constants");
const DecodeResult_1 = require("./DecodeResult");
function decodeConnection(reader, options = DecodeResult_1.defaultDecode) {
    reader.readSequence(constants_1.ConnectionBERID);
    let target = null;
    let sources = undefined;
    let operation = undefined;
    let disposition = undefined;
    let encodedSources;
    const errors = [];
    const endOffset = reader.offset + reader.length;
    while (reader.offset < endOffset) {
        const tag = reader.readSequence();
        switch (tag) {
            case Ber.CONTEXT(0):
                target = reader.readInt();
                break;
            case Ber.CONTEXT(1):
                encodedSources = reader.readRelativeOID(Ber.BERDataTypes.RELATIVE_OID);
                if (encodedSources.length === 0) {
                    sources = [];
                }
                else {
                    sources = encodedSources.split('.').map((i) => Number(i));
                }
                break;
            case Ber.CONTEXT(2):
                operation = (0, DecodeResult_1.appendErrors)(readConnectionOperation(reader.readInt(), options), errors);
                break;
            case Ber.CONTEXT(3):
                disposition = (0, DecodeResult_1.appendErrors)(readConnectionDisposition(reader.readInt(), options), errors);
                break;
            case 0:
                break; // Indefinite lengths
            default:
                (0, DecodeResult_1.unknownContext)(errors, 'decode connection', tag, options);
                (0, DecodeResult_1.skipNext)(reader);
                break;
        }
    }
    target = (0, DecodeResult_1.check)(target, 'deocde connection', 'target', -1, errors, options);
    return (0, DecodeResult_1.makeResult)(new Connection_1.ConnectionImpl(target, sources, operation, disposition), errors);
}
exports.decodeConnection = decodeConnection;
function readConnectionOperation(value, options = DecodeResult_1.defaultDecode) {
    switch (value) {
        case 0:
            return (0, DecodeResult_1.makeResult)(Connection_1.ConnectionOperation.Absolute);
        case 1:
            return (0, DecodeResult_1.makeResult)(Connection_1.ConnectionOperation.Connect);
        case 2:
            return (0, DecodeResult_1.makeResult)(Connection_1.ConnectionOperation.Disconnect);
        default:
            return (0, DecodeResult_1.unexpected)([], 'read connection options', `unexpected connection operation '${value}'`, Connection_1.ConnectionOperation.Absolute, options);
    }
}
function readConnectionDisposition(value, options = DecodeResult_1.defaultDecode) {
    switch (value) {
        case 0:
            return (0, DecodeResult_1.makeResult)(Connection_1.ConnectionDisposition.Tally);
        case 1:
            return (0, DecodeResult_1.makeResult)(Connection_1.ConnectionDisposition.Modified);
        case 2:
            return (0, DecodeResult_1.makeResult)(Connection_1.ConnectionDisposition.Pending);
        case 3:
            return (0, DecodeResult_1.makeResult)(Connection_1.ConnectionDisposition.Locked);
        default:
            return (0, DecodeResult_1.unexpected)([], 'read connection options', `unexpected connection operation '${value}'`, Connection_1.ConnectionDisposition.Tally, options);
    }
}
//# sourceMappingURL=Connection.js.map