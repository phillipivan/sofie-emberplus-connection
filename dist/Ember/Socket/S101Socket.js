"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const eventemitter3_1 = require("eventemitter3");
const S101_1 = require("../../S101");
const __1 = require("../..");
const Client_1 = require("../Client");
const util_1 = require("../Lib/util");
class S101Socket extends eventemitter3_1.EventEmitter {
    constructor(socket) {
        super();
        this.keepaliveInterval = 10;
        this.keepaliveMaxResponseTime = 500;
        this.codec = new S101_1.S101Codec();
        this.socket = socket;
        this.keepaliveIntervalTimer = undefined;
        this.keepaliveResponseWindowTimer = null;
        this.status = this.isConnected() ? Client_1.ConnectionStatus.Connected : Client_1.ConnectionStatus.Disconnected;
        this.codec.on('keepaliveReq', () => {
            this.sendKeepaliveResponse();
        });
        this.codec.on('keepaliveResp', () => {
            clearInterval(this.keepaliveResponseWindowTimer);
        });
        this.codec.on('emberPacket', (packet) => {
            try {
                const root = (0, __1.berDecode)(packet);
                if (root != null) {
                    this.emit('emberTree', root);
                }
            }
            catch (e) {
                this.emit('error', (0, util_1.normalizeError)(e));
            }
        });
        this.codec.on('emberStreamPacket', (packet) => {
            try {
                const root = (0, __1.berDecode)(packet);
                if (root != null) {
                    this.emit('emberStreamTree', root);
                }
            }
            catch (e) {
                this.emit('error', (0, util_1.normalizeError)(e));
            }
        });
        this._initSocket();
    }
    _initSocket() {
        if (this.socket != null) {
            this.socket.on('data', (data) => {
                try {
                    this.codec.dataIn(data);
                }
                catch (e) {
                    this.emit('error', (0, util_1.normalizeError)(e));
                }
            });
            this.socket.on('close', () => {
                this.emit('disconnected');
                this.status = Client_1.ConnectionStatus.Connected;
                this.socket?.removeAllListeners();
                this.socket = undefined;
            });
            this.socket.on('error', (e) => {
                this.emit('error', e);
            });
        }
    }
    /**
     * @param {number} timeout=2
     */
    async disconnect(timeout = 2) {
        if (!this.isConnected() || this.socket === undefined) {
            return Promise.resolve();
        }
        return new Promise((resolve) => {
            if (this.keepaliveIntervalTimer != null) {
                clearInterval(this.keepaliveIntervalTimer);
                this.keepaliveIntervalTimer = undefined;
            }
            if (this.socket) {
                let done = false;
                const cb = () => {
                    if (done) {
                        return;
                    }
                    done = true;
                    if (timer !== undefined) {
                        clearTimeout(timer);
                        timer = undefined;
                    }
                    resolve();
                };
                let timer;
                if (timeout != null && !isNaN(timeout) && timeout > 0) {
                    timer = setTimeout(cb, 100 * timeout);
                }
                this.socket.end(cb);
            }
            this.status = Client_1.ConnectionStatus.Disconnected;
        });
    }
    /**
     *
     */
    handleClose() {
        this.socket = undefined;
        if (this.keepaliveIntervalTimer)
            clearInterval(this.keepaliveIntervalTimer);
        this.status = Client_1.ConnectionStatus.Disconnected;
        this.emit('disconnected');
    }
    isConnected() {
        return this.socket !== undefined && !!this.socket;
    }
    sendBER(data) {
        if (this.isConnected() && this.socket) {
            try {
                const frames = this.codec.encodeBER(data);
                for (let i = 0; i < frames.length; i++) {
                    this.socket.write(frames[i]);
                }
                return true;
            }
            catch (e) {
                this.handleClose();
                return false;
            }
        }
        else {
            return false;
        }
    }
    /**
     *
     */
    sendKeepaliveRequest() {
        if (this.isConnected() && this.socket) {
            try {
                this.socket.write(this.codec.keepAliveRequest());
                this.keepaliveResponseWindowTimer = setTimeout(() => {
                    this.handleClose();
                }, this.keepaliveMaxResponseTime);
            }
            catch (e) {
                this.handleClose();
            }
        }
    }
    /**
     *
     */
    sendKeepaliveResponse() {
        if (this.isConnected() && this.socket) {
            try {
                this.socket.write(this.codec.keepAliveResponse());
            }
            catch (e) {
                this.handleClose();
            }
        }
    }
    // sendBERNode(node: Root) {
    // 	if (!node) return
    // 	const ber = berEncode(node)
    // 	this.sendBER(ber)
    // }
    startKeepAlive() {
        this.keepaliveIntervalTimer = setInterval(() => {
            try {
                this.sendKeepaliveRequest();
            }
            catch (e) {
                this.emit('error', (0, util_1.normalizeError)(e));
            }
        }, 1000 * this.keepaliveInterval);
    }
}
exports.default = S101Socket;
//# sourceMappingURL=S101Socket.js.map