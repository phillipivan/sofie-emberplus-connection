"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.decodeCommand = void 0;
const tslib_1 = require("tslib");
const Ber = tslib_1.__importStar(require("../../../Ber"));
const Command_1 = require("../../../model/Command");
const Invocation_1 = require("./Invocation");
const constants_1 = require("../constants");
const DecodeResult_1 = require("./DecodeResult");
function readDirFieldMask(reader) {
    const intToMask = {
        [-2]: Command_1.FieldFlags.Sparse,
        [-1]: Command_1.FieldFlags.All,
        [0]: Command_1.FieldFlags.Default,
        [1]: Command_1.FieldFlags.Identifier,
        [2]: Command_1.FieldFlags.Description,
        [3]: Command_1.FieldFlags.Tree,
        [4]: Command_1.FieldFlags.Value,
        [5]: Command_1.FieldFlags.Connections,
    };
    return intToMask[reader.readInt()];
}
function decodeCommand(reader, options = DecodeResult_1.defaultDecode) {
    reader.readSequence(constants_1.CommandBERID);
    let type = null;
    let dirFieldMask = undefined;
    let invocation = undefined;
    const errors = [];
    const endOffset = reader.offset + reader.length;
    while (reader.offset < endOffset) {
        const tag = reader.readSequence();
        switch (tag) {
            case Ber.CONTEXT(0):
                type = reader.readInt();
                break;
            case Ber.CONTEXT(1):
                dirFieldMask = readDirFieldMask(reader);
                if (!dirFieldMask) {
                    errors.push(new Error(`decode command: encounted unknown dir field mask`));
                }
                break;
            case Ber.CONTEXT(2):
                invocation = (0, DecodeResult_1.appendErrors)((0, Invocation_1.decodeInvocation)(reader, options), errors);
                break;
            case 0:
                break; // Indefinite lengths
            default:
                (0, DecodeResult_1.unknownContext)(errors, 'decode command', tag, options);
                (0, DecodeResult_1.skipNext)(reader);
                break;
        }
    }
    type = (0, DecodeResult_1.check)(type, 'decode command', 'type', Command_1.CommandType.Subscribe, errors, options);
    switch (type) {
        case Command_1.CommandType.Subscribe:
            return (0, DecodeResult_1.makeResult)(new Command_1.SubscribeImpl(), errors);
        case Command_1.CommandType.Unsubscribe:
            return (0, DecodeResult_1.makeResult)(new Command_1.UnsubscribeImpl(), errors);
        case Command_1.CommandType.GetDirectory:
            return (0, DecodeResult_1.makeResult)(new Command_1.GetDirectoryImpl(dirFieldMask), errors);
        case Command_1.CommandType.Invoke:
            return (0, DecodeResult_1.makeResult)(new Command_1.InvokeImpl(invocation), errors);
        default:
            return (0, DecodeResult_1.unexpected)(errors, 'decode command', `command type '${type}' is not recognized`, new Command_1.SubscribeImpl(), options);
    }
}
exports.decodeCommand = decodeCommand;
//# sourceMappingURL=Command.js.map