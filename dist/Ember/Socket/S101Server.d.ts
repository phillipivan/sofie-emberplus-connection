/// <reference types="node" />
import { EventEmitter } from 'eventemitter3';
import { Socket, Server } from 'net';
import S101Socket from './S101Socket';
export type S101ServerEvents = {
    error: [Error];
    listening: [];
    connection: [client: S101Socket];
};
export declare class S101Server extends EventEmitter<S101ServerEvents> {
    port: number;
    address: string | undefined;
    server: Server | null;
    status: string;
    constructor(port: number, address?: string);
    addClient(socket: Socket): void;
    listen(): Promise<void>;
    discard(): void;
}
//# sourceMappingURL=S101Server.d.ts.map