"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.encodeFunctionArgument = void 0;
const tslib_1 = require("tslib");
const Ber = tslib_1.__importStar(require("../../../Ber"));
const Errors_1 = require("../../../Errors");
const Parameter_1 = require("../../../model/Parameter");
const constants_1 = require("../constants");
function encodeFunctionArgument(arg, writer) {
    writer.startSequence(constants_1.FunctionArgumentBERID);
    if (arg.type == null) {
        throw new Errors_1.InvalidEmberNode('', 'FunctionArgument requires a type');
    }
    writer.startSequence(Ber.CONTEXT(0));
    writeParameterType(arg.type, writer);
    writer.endSequence();
    if (arg.name != null) {
        writer.startSequence(Ber.CONTEXT(1));
        writer.writeString(arg.name, Ber.BERDataTypes.STRING);
        writer.endSequence();
    }
    writer.endSequence();
}
exports.encodeFunctionArgument = encodeFunctionArgument;
function writeParameterType(type, writer) {
    const typeToInt = {
        [Parameter_1.ParameterType.Null]: 0,
        [Parameter_1.ParameterType.Integer]: 1,
        [Parameter_1.ParameterType.Real]: 2,
        [Parameter_1.ParameterType.String]: 3,
        [Parameter_1.ParameterType.Boolean]: 4,
        [Parameter_1.ParameterType.Trigger]: 5,
        [Parameter_1.ParameterType.Enum]: 6,
        [Parameter_1.ParameterType.Octets]: 7,
    };
    writer.writeInt(typeToInt[type]);
}
//# sourceMappingURL=FunctionArgument.js.map