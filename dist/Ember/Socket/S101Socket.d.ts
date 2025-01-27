/// <reference types="node" />
/// <reference types="node" />
/// <reference types="node" />
import { EventEmitter } from 'eventemitter3';
import { Socket } from 'net';
import { S101Codec } from '../../S101';
import { ConnectionStatus } from '../Client';
import { Root } from '../../types';
import { DecodeResult } from '../../encodings/ber/decoder/DecodeResult';
import { StreamEntry } from '../../model';
export type Request = any;
export type S101SocketEvents = {
    error: [Error];
    emberTree: [root: DecodeResult<Root>];
    emberStreamEntries: [StreamEntry[]];
    connecting: [];
    connected: [];
    disconnected: [];
};
export default class S101Socket extends EventEmitter<S101SocketEvents> {
    protected socket: Socket | undefined;
    private readonly keepaliveInterval;
    private readonly keepaliveMaxResponseTime;
    protected keepaliveIntervalTimer: NodeJS.Timeout | undefined;
    private keepaliveResponseWindowTimer;
    status: ConnectionStatus;
    protected readonly codec: S101Codec;
    constructor(socket?: Socket);
    private _initSocket;
    /**
     * @param {number} timeout=2
     */
    disconnect(timeout?: number): Promise<void>;
    /**
     *
     */
    protected handleClose(): void;
    private isConnected;
    sendBER(data: Buffer): boolean;
    /**
     *
     */
    private sendKeepaliveRequest;
    /**
     *
     */
    private sendKeepaliveResponse;
    protected startKeepAlive(): void;
}
//# sourceMappingURL=S101Socket.d.ts.map