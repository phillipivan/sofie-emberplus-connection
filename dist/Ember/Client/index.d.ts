/// <reference types="node" />
import { EmberValue, RootElement, QualifiedElement, TreeElement, NumberedTreeNode, EmberTypedValue, Collection, Root } from '../../types/types';
import { InvocationResult } from '../../model/InvocationResult';
import { Matrix } from '../../model/Matrix';
import { EmberElement } from '../../model/EmberElement';
import { FieldFlags } from '../../model/Command';
import { Parameter } from '../../model/Parameter';
import { EventEmitter } from 'eventemitter3';
import { EmberFunction } from '../../model/EmberFunction';
export type RequestPromise<T> = Promise<RequestPromiseArguments<T>>;
export interface RequestPromiseArguments<T> {
    sentOk: boolean;
    reqId?: string;
    cancel?: () => void;
    response?: Promise<T>;
}
export declare enum ExpectResponse {
    None = "none",
    Any = "any",
    HasChildren = "has-children"
}
export interface Request {
    reqId: string;
    node: RootElement;
    nodeResponse: ExpectResponse;
    resolve: (res: any) => void;
    reject: (err: Error) => void;
    cb?: (EmberNode: TreeElement<EmberElement>) => void;
    message: Buffer;
    firstSent: number;
    lastSent: number;
}
export interface Subscription {
    path: string | undefined;
    cb: (EmberNode: TreeElement<EmberElement>) => void;
}
export interface Change {
    path: string | undefined;
    node: RootElement;
    emptyNode?: boolean;
}
export declare enum ConnectionStatus {
    Error = 0,
    Disconnected = 1,
    Connecting = 2,
    Connected = 3
}
export type EmberClientEvents = {
    error: [Error];
    warn: [Error];
    connected: [];
    disconnected: [];
    streamUpdate: [path: string, value: EmberValue];
};
export declare class EmberClient extends EventEmitter<EmberClientEvents> {
    host: string;
    port: number;
    tree: Collection<NumberedTreeNode<EmberElement>>;
    private _streamManager;
    private _requests;
    private _lastInvocation;
    private _client;
    private _subscriptions;
    private _timeout;
    private _resendTimeout;
    private _resends;
    private _timer;
    constructor(host: string, port?: number, timeout?: number, enableResends?: boolean, resendTimeout?: number);
    /**
     * Opens an s101 socket to the provider.
     * @param host The host of the emberplus provider
     * @param port Port of the provider
     */
    connect(host?: string, port?: number): Promise<void | Error>;
    /**
     * Closes the s101 socket to the provider
     */
    disconnect(): Promise<void>;
    /**
     * Discards any outgoing connections, removes all requests and clears any timing loops
     *
     * This is destructive, using this class after discarding will cause errors.
     */
    discard(): void;
    get connected(): boolean;
    /** Ember+ commands: */
    getDirectory(node: RootElement | Collection<RootElement>, dirFieldMask?: FieldFlags, cb?: (EmberNode: TreeElement<EmberElement>) => void): RequestPromise<Root | RootElement>;
    subscribe(node: RootElement | Array<RootElement>, cb?: (EmberNode: TreeElement<EmberElement>) => void): RequestPromise<Root | void>;
    unsubscribe(node: NumberedTreeNode<EmberElement> | Array<RootElement>): RequestPromise<Root | void>;
    invoke(node: NumberedTreeNode<EmberFunction> | QualifiedElement<EmberFunction>, ...args: Array<EmberTypedValue>): RequestPromise<InvocationResult>;
    /** Sending ember+ values */
    setValue(node: QualifiedElement<Parameter> | NumberedTreeNode<Parameter>, value: EmberValue, awaitResponse?: boolean): RequestPromise<TreeElement<Parameter>>;
    matrixConnect(matrix: QualifiedElement<Matrix> | NumberedTreeNode<Matrix>, target: number, sources: Array<number>): RequestPromise<TreeElement<Matrix>>;
    matrixDisconnect(matrix: QualifiedElement<Matrix> | NumberedTreeNode<Matrix>, target: number, sources: Array<number>): RequestPromise<TreeElement<Matrix>>;
    matrixSetConnection(matrix: QualifiedElement<Matrix> | NumberedTreeNode<Matrix>, target: number, sources: Array<number>): RequestPromise<TreeElement<Matrix>>;
    /** Getting the tree: */
    expand(node: NumberedTreeNode<EmberElement> | Collection<RootElement>): Promise<void>;
    getElementByPath(path: string, cb?: (EmberNode: TreeElement<EmberElement>) => void, delimiter?: string): Promise<TreeElement<EmberElement> | undefined>;
    getInternalNodePath(node: TreeElement<EmberElement>): string | undefined;
    private _matrixMutation;
    private _sendCommand;
    private _sendRequest;
    private _handleIncoming;
    private _applyRootToTree;
    private _updateTree;
    private _updateEmberNode;
    private _updateParameter;
    private _updateMatrix;
    private _resendTimer;
}
//# sourceMappingURL=index.d.ts.map