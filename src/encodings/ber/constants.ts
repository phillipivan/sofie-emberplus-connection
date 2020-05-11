import * as Ber from '../../Ber'

export {
	CommandBERID,
	ConnectionBERID,
	FunctionBERID,
	NodeBERID,
	FunctionArgumentBERID,
	InvocationBERID,
	InvocationResultBERID,
	LabelBERID,
	MatrixBERID,
	ParameterBERID,
	StreamDescriptionBERID,
	StreamEntryBERID,
	StringIntegerCollectionBERID,
	StringIntegerPairBERID,
	TemplateBERID,
	RootElementsBERID,
	StreamEntriesBERID,
	QualifiedTemplateBERID,
	QualifiedParameterBERID,
	QualifiedNodeBERID,
	QualifiedMatrixBERID,
	QualifiedFunctionBERID
}

const CommandBERID = Ber.APPLICATION(2)
const ConnectionBERID = Ber.APPLICATION(16)
const FunctionBERID = Ber.APPLICATION(19)
const NodeBERID = Ber.APPLICATION(3)
const FunctionArgumentBERID = Ber.APPLICATION(21)
const InvocationBERID = Ber.APPLICATION(22)
const InvocationResultBERID = Ber.APPLICATION(23)
const LabelBERID = Ber.APPLICATION(18)
const MatrixBERID = Ber.APPLICATION(13)
const ParameterBERID = Ber.APPLICATION(1)
const StreamDescriptionBERID = Ber.APPLICATION(12)
const StreamEntryBERID = Ber.APPLICATION(5)
const StringIntegerCollectionBERID = Ber.APPLICATION(8)
const StringIntegerPairBERID = Ber.APPLICATION(7)
const TemplateBERID = Ber.APPLICATION(24)
const RootElementsBERID = Ber.APPLICATION(11)
const StreamEntriesBERID = Ber.APPLICATION(6)

const QualifiedTemplateBERID = Ber.APPLICATION(25)
const QualifiedParameterBERID = Ber.APPLICATION(9)
const QualifiedNodeBERID = Ber.APPLICATION(10)
const QualifiedMatrixBERID = Ber.APPLICATION(17)
const QualifiedFunctionBERID = Ber.APPLICATION(20)
