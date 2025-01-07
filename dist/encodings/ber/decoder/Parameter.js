"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.readParameterType = exports.decodeParameter = void 0;
const tslib_1 = require("tslib");
const Ber = tslib_1.__importStar(require("../../../Ber"));
const Parameter_1 = require("../../../model/Parameter");
const StreamDescription_1 = require("./StreamDescription");
const StringIntegerCollection_1 = require("./StringIntegerCollection");
const DecodeResult_1 = require("./DecodeResult");
function decodeParameter(reader, options = DecodeResult_1.defaultDecode) {
    reader.readSequence(Ber.BERDataTypes.SET);
    let identifier = undefined;
    let description = undefined;
    let value = undefined;
    let valueType = undefined;
    let minimum = undefined;
    let maximum = undefined;
    let access = undefined;
    let format = undefined;
    let enumeration = undefined;
    let factor = undefined;
    let isOnline = undefined;
    let formula = undefined;
    let step = undefined;
    let defaultValue = undefined;
    let parameterType = undefined;
    let streamIdentifier = undefined;
    let enumMap = undefined;
    let streamDescriptor = undefined;
    let schemaIdentifiers = undefined;
    let templateReference = undefined;
    const errors = [];
    const endOffset = reader.offset + reader.length;
    while (reader.offset < endOffset) {
        const tag = reader.readSequence();
        switch (tag) {
            case Ber.CONTEXT(0):
                identifier = reader.readString(Ber.BERDataTypes.STRING);
                break;
            case Ber.CONTEXT(1):
                description = reader.readString(Ber.BERDataTypes.STRING);
                break;
            case Ber.CONTEXT(2): {
                const decodedValue = reader.readValue();
                value = decodedValue.value;
                valueType = decodedValue.type;
                break;
            }
            case Ber.CONTEXT(3):
                minimum = reader.readValue().value;
                break;
            case Ber.CONTEXT(4):
                maximum = reader.readValue().value;
                break;
            case Ber.CONTEXT(5):
                access = (0, DecodeResult_1.appendErrors)(readParameterAccess(reader.readInt(), options), errors);
                break;
            case Ber.CONTEXT(6):
                format = reader.readString(Ber.BERDataTypes.STRING);
                break;
            case Ber.CONTEXT(7):
                enumeration = reader.readString(Ber.BERDataTypes.STRING);
                break;
            case Ber.CONTEXT(8):
                factor = reader.readInt();
                break;
            case Ber.CONTEXT(9):
                isOnline = reader.readBoolean();
                break;
            case Ber.CONTEXT(10):
                formula = reader.readString(Ber.BERDataTypes.STRING);
                break;
            case Ber.CONTEXT(11):
                step = reader.readInt();
                break;
            case Ber.CONTEXT(12):
                defaultValue = reader.readValue().value; // Write value uses type
                break;
            case Ber.CONTEXT(13):
                parameterType = (0, DecodeResult_1.appendErrors)(readParameterType(reader.readInt(), options), errors);
                break;
            case Ber.CONTEXT(14):
                streamIdentifier = reader.readInt();
                break;
            case Ber.CONTEXT(15):
                enumMap = (0, DecodeResult_1.appendErrors)((0, StringIntegerCollection_1.decodeStringIntegerCollection)(reader, options), errors);
                break;
            case Ber.CONTEXT(16):
                streamDescriptor = (0, DecodeResult_1.appendErrors)((0, StreamDescription_1.decodeStreamDescription)(reader, options), errors);
                break;
            case Ber.CONTEXT(17):
                schemaIdentifiers = reader.readString(Ber.BERDataTypes.STRING);
                break;
            case Ber.CONTEXT(18):
                templateReference = reader.readString(Ber.BERDataTypes.STRING);
                break;
            case 0:
                break; // indefinite length
            default:
                (0, DecodeResult_1.unknownContext)(errors, 'decode parameter', tag, options);
                (0, DecodeResult_1.skipNext)(reader);
                break;
        }
    }
    parameterType =
        parameterType === Parameter_1.ParameterType.Trigger
            ? Parameter_1.ParameterType.Trigger
            : !!enumMap || !!enumeration
                ? Parameter_1.ParameterType.Enum
                : valueType
                    ? valueType
                    : parameterType;
    parameterType = (0, DecodeResult_1.check)(parameterType, 'decode parameter', 'parameterType', Parameter_1.ParameterType.Null, errors, options);
    return (0, DecodeResult_1.makeResult)(new Parameter_1.ParameterImpl(parameterType, identifier, description, value, maximum, minimum, access, format, enumeration, factor, isOnline, formula, step, defaultValue, streamIdentifier, enumMap, streamDescriptor, schemaIdentifiers, templateReference), errors);
}
exports.decodeParameter = decodeParameter;
function readParameterAccess(value, options) {
    switch (value) {
        case 0:
            return (0, DecodeResult_1.makeResult)(Parameter_1.ParameterAccess.None);
        case 1:
            return (0, DecodeResult_1.makeResult)(Parameter_1.ParameterAccess.Read);
        case 2:
            return (0, DecodeResult_1.makeResult)(Parameter_1.ParameterAccess.Write);
        case 3:
            return (0, DecodeResult_1.makeResult)(Parameter_1.ParameterAccess.ReadWrite);
        default:
            return (0, DecodeResult_1.unexpected)([], 'read parameter access', `unexpected parameter access '${value}'`, Parameter_1.ParameterAccess.ReadWrite, options);
    }
}
function readParameterType(value, options) {
    switch (value) {
        case 0:
            return (0, DecodeResult_1.makeResult)(Parameter_1.ParameterType.Null);
        case 1:
            return (0, DecodeResult_1.makeResult)(Parameter_1.ParameterType.Integer);
        case 2:
            return (0, DecodeResult_1.makeResult)(Parameter_1.ParameterType.Real);
        case 3:
            return (0, DecodeResult_1.makeResult)(Parameter_1.ParameterType.String);
        case 4:
            return (0, DecodeResult_1.makeResult)(Parameter_1.ParameterType.Boolean);
        case 5:
            return (0, DecodeResult_1.makeResult)(Parameter_1.ParameterType.Trigger);
        case 6:
            return (0, DecodeResult_1.makeResult)(Parameter_1.ParameterType.Enum);
        case 7:
            return (0, DecodeResult_1.makeResult)(Parameter_1.ParameterType.Octets);
        default:
            return (0, DecodeResult_1.unexpected)([], 'read parameter type', `unexpected parameter type '${value}'`, Parameter_1.ParameterType.Null, options);
    }
}
exports.readParameterType = readParameterType;
//# sourceMappingURL=Parameter.js.map