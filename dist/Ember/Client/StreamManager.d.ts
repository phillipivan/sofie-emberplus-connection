import { EventEmitter } from 'eventemitter3';
import { Parameter } from '../../model/Parameter';
import { EmberValue } from '../../types';
import { Collection } from '../../types/types';
import { StreamEntry } from '../../model';
export type StreamManagerEvents = {
    streamUpdate: [path: string, value: EmberValue];
};
interface StreamInfo {
    parameter: Parameter;
    path: string;
    streamIdentifier: number;
    offset: number;
    lastUpdate?: number;
}
export declare class StreamManager extends EventEmitter<StreamManagerEvents> {
    private registeredStreams;
    private streamsByIdentifier;
    constructor();
    registerParameter(parameter: Parameter, path: string): void;
    unregisterParameter(path: string): void;
    getStreamInfoByPath(path: string): StreamInfo | undefined;
    hasStream(identifier: string): boolean;
    updateStreamValues(streamEntries: Collection<StreamEntry>): void;
    updateStreamValue(path: string, value: EmberValue): void;
    getAllRegisteredPaths(): string[];
    printStreamState(): void;
}
export {};
//# sourceMappingURL=StreamManager.d.ts.map