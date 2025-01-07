"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.S101Server = void 0;
const tslib_1 = require("tslib");
const eventemitter3_1 = require("eventemitter3");
const net_1 = require("net");
const S101Socket_1 = tslib_1.__importDefault(require("./S101Socket"));
class S101Server extends eventemitter3_1.EventEmitter {
    constructor(port, address) {
        super();
        this.port = port;
        this.address = address;
        this.server = null;
        this.status = 'disconnected';
    }
    addClient(socket) {
        // Wrap the tcp socket into an S101Socket.
        const client = new S101Socket_1.default(socket);
        this.emit('connection', client);
    }
    async listen() {
        return new Promise((resolve, reject) => {
            if (this.status !== 'disconnected') {
                return reject(new Error('Already listening'));
            }
            this.server = (0, net_1.createServer)((socket) => {
                this.addClient(socket);
            })
                .on('error', (e) => {
                this.emit('error', e);
                if (this.status === 'disconnected') {
                    return reject(e);
                }
            })
                .on('listening', () => {
                this.emit('listening');
                this.status = 'listening';
                resolve(undefined);
            });
            this.server.listen(this.port, this.address);
        });
    }
    discard() {
        this.server?.close();
    }
}
exports.S101Server = S101Server;
//# sourceMappingURL=S101Server.js.map