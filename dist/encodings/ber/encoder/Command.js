"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.encodeCommand = void 0;
const tslib_1 = require("tslib");
const Ber = tslib_1.__importStar(require("../../../Ber"));
const Command_1 = require("../../../model/Command");
const Invocation_1 = require("./Invocation");
const constants_1 = require("../constants");
function encodeCommand(el, writer) {
    writer.startSequence(constants_1.CommandBERID);
    writer.startSequence(Ber.CONTEXT(0));
    writer.writeInt(el.number);
    writer.endSequence(); // BER.CONTEXT(0)
    if (isGetDirectory(el) && el.dirFieldMask) {
        writer.startSequence(Ber.CONTEXT(1));
        writeDirFieldMask(el.dirFieldMask, writer);
        writer.endSequence();
    }
    if (isInvoke(el) && el.invocation) {
        writer.startSequence(Ber.CONTEXT(2));
        (0, Invocation_1.encodeInvocation)(el.invocation, writer);
        writer.endSequence();
    }
    writer.endSequence(); // CommandBERID
}
exports.encodeCommand = encodeCommand;
function isInvoke(command) {
    return command.number === Command_1.CommandType.Invoke;
}
function isGetDirectory(command) {
    return command.number === Command_1.CommandType.GetDirectory;
}
function writeDirFieldMask(fieldMask, writer) {
    const maskToInt = {
        [Command_1.FieldFlags.Sparse]: -2,
        [Command_1.FieldFlags.All]: -1,
        [Command_1.FieldFlags.Default]: 0,
        [Command_1.FieldFlags.Identifier]: 1,
        [Command_1.FieldFlags.Description]: 2,
        [Command_1.FieldFlags.Tree]: 3,
        [Command_1.FieldFlags.Value]: 4,
        [Command_1.FieldFlags.Connections]: 5,
    };
    writer.writeInt(maskToInt[fieldMask]);
}
//# sourceMappingURL=Command.js.map