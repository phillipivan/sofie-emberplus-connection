import { EmberElement } from './EmberElement';
import { RelativeOID, RootElement, Collection } from '../types/types';
export { TreeElement, NumberedTreeNode, QualifiedElement, NumberedTreeNodeImpl, QualifiedElementImpl };
interface TreeElement<T extends EmberElement> {
    parent?: RootElement;
    contents: T;
    children?: Collection<NumberedTreeNode<EmberElement>>;
}
interface NumberedTreeNode<T extends EmberElement> extends TreeElement<T> {
    number: number;
}
interface QualifiedElement<T extends EmberElement> extends TreeElement<T> {
    path: RelativeOID;
    parent: undefined;
}
declare abstract class TreeElementImpl<T extends EmberElement> implements TreeElement<T> {
    contents: T;
    children?: Collection<NumberedTreeNode<EmberElement>> | undefined;
    parent?: RootElement | undefined;
    constructor(contents: T, children?: Collection<NumberedTreeNode<EmberElement>> | undefined, parent?: RootElement | undefined);
}
declare class NumberedTreeNodeImpl<T extends EmberElement> extends TreeElementImpl<T> implements NumberedTreeNode<T> {
    number: number;
    constructor(number: number, contents: T, children?: Collection<NumberedTreeNode<EmberElement>>, parent?: RootElement);
}
declare class QualifiedElementImpl<T extends EmberElement> extends TreeElementImpl<T> implements QualifiedElement<T> {
    path: RelativeOID;
    parent: undefined;
    constructor(path: RelativeOID, contents: T, children?: Collection<NumberedTreeNode<EmberElement>>);
}
//# sourceMappingURL=Tree.d.ts.map