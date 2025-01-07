/// <reference types="node" />
import { EventEmitter } from 'eventemitter3';
import { SmartBuffer } from 'smart-buffer';
export type S101CodecEvents = {
    emberPacket: [packet: Buffer];
    emberStreamPacket: [packet: Buffer];
    keepaliveReq: [];
    keepaliveResp: [];
};
export default class S101Codec extends EventEmitter<S101CodecEvents> {
    inbuf: SmartBuffer;
    emberbuf: SmartBuffer;
    escaped: boolean;
    private multiPacketBuffer?;
    private isMultiPacket;
    dataIn(buf: Buffer): void;
    handleFrame(frame: SmartBuffer): void;
    handleEmberFrame(frame: SmartBuffer): void;
    private handleEmberPacket;
    private handleEmberStreamPacket;
    resetMultiPacketBuffer(): void;
    encodeBER(data: Buffer): Buffer[];
    keepAliveRequest(): Buffer;
    keepAliveResponse(): Buffer;
    validateFrame(buf: Buffer): boolean;
    private _makeBERFrame;
    private _finalizeBuffer;
    private _calculateCRC;
    private _calculateCRCCE;
}
//# sourceMappingURL=S101Codec.d.ts.map