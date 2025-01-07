"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.encodeConnection = void 0;
const tslib_1 = require("tslib");
const Connection_1 = require("../../../model/Connection");
const Ber = tslib_1.__importStar(require("../../../Ber"));
const constants_1 = require("../constants");
function encodeConnection(connection, writer) {
    writer.startSequence(constants_1.ConnectionBERID);
    writer.startSequence(Ber.CONTEXT(0));
    writer.writeInt(connection.target);
    writer.endSequence();
    if (connection.sources != null) {
        writer.startSequence(Ber.CONTEXT(1));
        writer.writeRelativeOID(connection.sources.join('.'), Ber.BERDataTypes.RELATIVE_OID);
        writer.endSequence();
    }
    if (connection.operation != null) {
        writer.startSequence(Ber.CONTEXT(2));
        writeConnectionOperation(connection.operation, writer);
        writer.endSequence();
    }
    if (connection.disposition != null) {
        writer.startSequence(Ber.CONTEXT(3));
        writeConnectionDisposition(connection.disposition, writer);
        writer.endSequence();
    }
    writer.endSequence();
}
exports.encodeConnection = encodeConnection;
function writeConnectionOperation(operation, writer) {
    const operationToInt = {
        [Connection_1.ConnectionOperation.Absolute]: 0,
        [Connection_1.ConnectionOperation.Connect]: 1,
        [Connection_1.ConnectionOperation.Disconnect]: 2,
    };
    writer.writeInt(operationToInt[operation]);
}
function writeConnectionDisposition(operation, writer) {
    const operationToInt = {
        [Connection_1.ConnectionDisposition.Tally]: 0,
        [Connection_1.ConnectionDisposition.Modified]: 1,
        [Connection_1.ConnectionDisposition.Pending]: 2,
        [Connection_1.ConnectionDisposition.Locked]: 3,
    };
    writer.writeInt(operationToInt[operation]);
}
//# sourceMappingURL=Connection.js.map