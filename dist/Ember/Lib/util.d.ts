import { NumberedTreeNode, RootElement } from '../../types/types';
import { EmberElement } from '../../model/EmberElement';
import { Command } from '../../model/Command';
import { TreeElement } from '../../model/Tree';
export declare function assertQualifiedEmberNode(node: RootElement): Exclude<RootElement, NumberedTreeNode<EmberElement>>;
export declare function getPath(node: RootElement): string;
export declare function toQualifiedEmberNode(EmberNode: NumberedTreeNode<EmberElement>): Exclude<RootElement, NumberedTreeNode<EmberElement>>;
export declare function insertCommand(node: Exclude<RootElement, NumberedTreeNode<EmberElement>>, command: Command): Exclude<RootElement, NumberedTreeNode<EmberElement>>;
export declare function updateProps<T extends object>(oldProps: T, newProps: T, props?: Array<keyof T>): void;
/**
 * Check if a value is an error, or wrap it in one
 */
export declare function normalizeError(e: unknown): Error;
export declare function isEmptyNode(node: TreeElement<EmberElement>): boolean;
//# sourceMappingURL=util.d.ts.map