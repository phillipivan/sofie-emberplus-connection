import { EventEmitter } from 'eventemitter3';
import { EmberElement, EmberFunction, InvocationResult, Parameter, Matrix, Connections } from '../../model';
import { Collection, NumberedTreeNode, EmberValue } from '../../types/types';
import { Invoke } from '../../model/Command';
import { Connection } from '../../model/Connection';
import S101Socket from '../Socket/S101Socket';
export type EmberServerEvents = {
    error: [Error];
    clientError: [client: S101Socket, error: Error];
};
export declare class EmberServer extends EventEmitter<EmberServerEvents> {
    address: string | undefined;
    port: number;
    tree: Collection<NumberedTreeNode<EmberElement>>;
    onInvocation?: (emberFunction: NumberedTreeNode<EmberFunction>, invocation: NumberedTreeNode<Invoke>) => Promise<InvocationResult>;
    onSetValue?: (parameter: NumberedTreeNode<Parameter>, value: EmberValue) => Promise<boolean>;
    onMatrixOperation?: (Matrix: NumberedTreeNode<Matrix>, connection: Connections) => Promise<void>;
    private _server;
    private _clients;
    private _subscriptions;
    constructor(port: number, address?: string);
    init(tree: Collection<NumberedTreeNode<EmberElement>>): Promise<void>;
    discard(): void;
    update<T extends EmberElement>(element: NumberedTreeNode<T>, update: Partial<T>): void;
    updateMatrixConnection(element: NumberedTreeNode<Matrix>, update: Connection): void;
    private _handleIncoming;
    private _handleNode;
    private _handleMatrix;
    private _handleSetValue;
    private _handleCommand;
    getElementByPath(path: string, delimiter?: string): NumberedTreeNode<EmberElement> | undefined;
    private _subscribe;
    private _unsubscribe;
    private _clearSubscription;
    private _handleGetDirectory;
}
//# sourceMappingURL=index.d.ts.map