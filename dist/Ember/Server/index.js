"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EmberServer = void 0;
const eventemitter3_1 = require("eventemitter3");
const S101Server_1 = require("../Socket/S101Server");
const model_1 = require("../../model");
const types_1 = require("../../types/types");
const util_1 = require("../Lib/util");
const ber_1 = require("../../encodings/ber");
const Command_1 = require("../../model/Command");
const Connection_1 = require("../../model/Connection");
const InvocationResult_1 = require("../../model/InvocationResult");
class EmberServer extends eventemitter3_1.EventEmitter {
    constructor(port, address) {
        super();
        this.tree = {};
        this._clients = new Set();
        this._subscriptions = {};
        this.address = address;
        this.port = port;
        this._server = new S101Server_1.S101Server(port, address);
        this._server.on('connection', (client) => {
            this._clients.add(client);
            client.on('emberTree', (tree) => this._handleIncoming(tree, client));
            client.on('error', (e) => {
                this.emit('clientError', client, e);
            });
            client.on('disconnected', () => {
                this._clearSubscription(client);
                this._clients.delete(client);
            });
        });
    }
    async init(tree) {
        const setParent = (parent, child) => {
            child.parent = parent;
            if (child.children) {
                for (const c of Object.values(child.children)) {
                    setParent(child, c);
                }
            }
        };
        for (const rootEl of Object.values(tree)) {
            if (rootEl.children) {
                for (const c of Object.values(rootEl.children)) {
                    setParent(rootEl, c);
                }
            }
        }
        this.tree = tree;
        return this._server.listen();
    }
    discard() {
        this._clients.forEach((c) => {
            c.removeAllListeners();
        });
        this._clients.clear();
        this._server.server?.close();
    }
    update(element, update) {
        if (element.contents.type === model_1.ElementType.Matrix) {
            const matrix = element;
            const matrixUpdate = update;
            if (matrixUpdate.connections) {
                for (const connection of Object.values(matrixUpdate.connections)) {
                    this.updateMatrixConnection(matrix, connection);
                }
            }
        }
        for (const [key, value] of Object.entries(update)) {
            element.contents[key] = value;
        }
        const el = (0, util_1.toQualifiedEmberNode)(element);
        const data = (0, ber_1.berEncode)([el], types_1.RootType.Elements);
        let elPath = el.path;
        if (el.contents.type !== model_1.ElementType.Node && !('targets' in update || 'sources' in update)) {
            elPath = elPath.slice(0, -2); // remove the last element number
        }
        for (const [path, clients] of Object.entries(this._subscriptions)) {
            if (elPath === path) {
                clients.forEach((client) => {
                    client.sendBER(data);
                });
            }
        }
    }
    updateMatrixConnection(element, update) {
        if (!element.contents.connections)
            element.contents.connections = {};
        let connection = element.contents.connections[update.target];
        if (!connection) {
            element.contents.connections[update.target] = new Connection_1.ConnectionImpl(update.target, []);
            connection = element.contents.connections[update.target];
        }
        if (!connection.sources)
            connection.sources = [];
        switch (update.operation) {
            case Connection_1.ConnectionOperation.Connect:
                for (const source of update.sources || []) {
                    if (!connection.sources.find((v) => v === source)) {
                        connection.sources.push(source);
                    }
                }
                break;
            case Connection_1.ConnectionOperation.Disconnect:
                for (const source of update.sources || []) {
                    connection.sources = connection.sources.filter((oldSource) => oldSource !== source);
                }
                break;
            case Connection_1.ConnectionOperation.Absolute:
            default:
                connection.sources = update.sources;
                break;
        }
        const qualified = (0, util_1.toQualifiedEmberNode)(element);
        qualified.contents = new model_1.MatrixImpl(qualified.contents.identifier, undefined, undefined, {
            [connection.target]: connection,
        });
        const data = (0, ber_1.berEncode)([qualified], types_1.RootType.Elements);
        for (const [path, clients] of Object.entries(this._subscriptions)) {
            if (qualified.path === path) {
                clients.forEach((client) => {
                    client.sendBER(data);
                });
            }
        }
    }
    _handleIncoming(incoming, client) {
        for (const rootEl of Object.values(incoming.value)) {
            if (rootEl.contents.type === model_1.ElementType.Command) {
                // command on root
                this._handleCommand('', rootEl, client).catch((e) => this.emit('error', e));
            }
            else if ('path' in rootEl) {
                this._handleNode(rootEl.path || '', rootEl, client);
            }
            else if ('number' in rootEl) {
                this._handleNode(rootEl.number + '' || '', rootEl, client);
            }
        }
    }
    _handleNode(path, el, client) {
        const children = Object.values(el.children || {});
        if (children[0] && children[0].contents.type === model_1.ElementType.Command) {
            this._handleCommand(path, children[0], client).catch((e) => this.emit('error', e));
            return;
        }
        else if (el.contents.type === model_1.ElementType.Matrix && 'connections' in el.contents) {
            this._handleMatrix(path, el).catch((e) => this.emit('error', e));
        }
        if (!el.children) {
            if (el.contents.type === model_1.ElementType.Parameter) {
                this._handleSetValue(path, el, client).catch((e) => this.emit('error', e));
            }
        }
        else {
            for (const c of children) {
                this._handleNode(path + '.' + c.number, c, client);
            }
        }
    }
    async _handleMatrix(path, el) {
        if (this.onMatrixOperation) {
            const tree = this.getElementByPath(path);
            if (!tree || tree.contents.type !== model_1.ElementType.Matrix || !el.contents.connections)
                return;
            return this.onMatrixOperation(tree, el.contents.connections);
        }
    }
    async _handleSetValue(path, el, client) {
        const tree = this.getElementByPath(path);
        if (!tree || tree.contents.type !== model_1.ElementType.Parameter || el.contents.value === undefined)
            return;
        let success = false;
        if (this.onSetValue) {
            success = await this.onSetValue(tree, el.contents.value);
        }
        if (!success) {
            const qualified = (0, util_1.toQualifiedEmberNode)(tree);
            const encoded = (0, ber_1.berEncode)([qualified], types_1.RootType.Elements);
            client.sendBER(encoded);
        }
    }
    async _handleCommand(path, el, client) {
        const tree = path ? this.getElementByPath(path) : this.tree;
        if (!tree)
            return;
        if (el.contents.number === Command_1.CommandType.Subscribe) {
            this._subscribe(path, client);
        }
        else if (el.contents.number === Command_1.CommandType.Unsubscribe) {
            this._unsubscribe(path, client);
        }
        else if (el.contents.number === Command_1.CommandType.GetDirectory) {
            this._subscribe(path, client); // send updates to client
            this._handleGetDirectory(tree, el.contents.dirFieldMask || Command_1.FieldFlags.Default, client);
        }
        else if (el.contents.number === Command_1.CommandType.Invoke) {
            let result;
            if (this.onInvocation) {
                result = await this.onInvocation(tree, el);
            }
            else {
                result = new InvocationResult_1.InvocationResultImpl(el.contents.invocation?.id || -1, false);
            }
            const encoded = (0, ber_1.berEncode)(result, types_1.RootType.InvocationResult);
            client.sendBER(encoded);
        }
    }
    getElementByPath(path, delimiter = '.') {
        const getNext = (elements, i) => Object.values(elements || {}).find((r) => r.number === Number(i) ||
            r.contents.identifier === i ||
            r.contents.description === i);
        const getNextChild = (node, i) => node.children && getNext(node.children, i);
        const numberedPath = [];
        const pathArr = path.split(delimiter);
        const i = pathArr.shift();
        let tree = getNext(this.tree, i);
        if (tree?.number)
            numberedPath.push(tree?.number);
        while (pathArr.length) {
            const i = pathArr.shift();
            if (!i)
                break;
            if (!tree)
                break;
            const next = getNextChild(tree, i);
            if (!next) {
                // not found
                return;
            }
            tree = next;
            if (!tree)
                return;
            if (tree?.number)
                numberedPath.push(tree?.number);
        }
        return tree;
    }
    _subscribe(path, client) {
        this._subscriptions[path] = [...(this._subscriptions[path] || []), client];
    }
    _unsubscribe(path, client) {
        if (!this._subscriptions[path])
            return;
        this._subscriptions[path].forEach((c, i) => {
            if (c === client) {
                this._subscriptions[path].splice(i, 1);
            }
        });
    }
    _clearSubscription(client) {
        for (const path of Object.keys(this._subscriptions)) {
            this._unsubscribe(path, client);
        }
    }
    _handleGetDirectory(tree, _dirFieldMasks, client) {
        if (tree === this.tree) {
            // getDir on root
            const response = { ...this.tree };
            for (const [i, rootEl] of Object.entries(this.tree)) {
                response[i] = new model_1.NumberedTreeNodeImpl(rootEl.number, rootEl.contents);
            }
            const data = (0, ber_1.berEncode)(response, types_1.RootType.Elements);
            client.sendBER(data);
        }
        else {
            const qualified = (0, util_1.toQualifiedEmberNode)(tree);
            qualified.children = {}; // destroy ref to this.tree
            if ('children' in tree && tree.children) {
                for (const [i, child] of Object.entries(tree.children)) {
                    if (child.contents.type === model_1.ElementType.Matrix) {
                        // matrix should not have connections, targets and sources:
                        qualified.children[i] = new model_1.NumberedTreeNodeImpl(child.number, new model_1.MatrixImpl(child.contents.identifier, undefined, undefined, undefined, child.contents.description, child.contents.matrixType, child.contents.addressingMode, child.contents.targetCount, child.contents.sourceCount, child.contents.maximumTotalConnects, child.contents.maximumConnectsPerTarget, child.contents.parametersLocation, child.contents.gainParameterNumber, child.contents.labels, child.contents.schemaIdentifiers, child.contents.templateReference));
                    }
                    else {
                        qualified.children[i] = new model_1.NumberedTreeNodeImpl(child.number, child.contents);
                    }
                }
            }
            else if (qualified.contents.type === model_1.ElementType.Node && !('children' in tree && tree.children)) {
                // node without children -> none of the properties should be set
                qualified.contents = new model_1.EmberNodeImpl();
                qualified.children = undefined;
            }
            const data = (0, ber_1.berEncode)([qualified], types_1.RootType.Elements);
            client.sendBER(data);
        }
    }
}
exports.EmberServer = EmberServer;
//# sourceMappingURL=index.js.map