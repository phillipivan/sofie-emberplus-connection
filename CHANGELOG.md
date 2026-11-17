# Changelog

All notable changes to this project will be documented in this file. See [Convential Commits](https://www.conventionalcommits.org/en/v1.0.0/#specification) for commit guidelines.

## [0.5.0](https://github.com/phillipivan/sofie-emberplus-connection/compare/v0.4.5...v0.5.0) (unreleased)

### ⚠ BREAKING CHANGES

* **Reconnecting:** `EmberClientOptions.reconnectAttempts` and the `S101Client` constructor's fourth parameter are removed. The client keeps retrying, backing off from 5 s to a minute, until it connects or is disconnected. [df1a403](https://github.com/phillipivan/sofie-emberplus-connection/commit/df1a403c3b2772b4bd06544d73c31fb5b4af67a1) [d8673d0](https://github.com/phillipivan/sofie-emberplus-connection/commit/d8673d0c4fd84255f5dd7338192686c0eb58a1e3)
* **Matrix connection requests:** the response of `matrixConnect`, `matrixDisconnect` and `matrixSetConnection` rejects when the provider reports the target as locked, and only a report on the requested target settles it. [ebf013a](https://github.com/phillipivan/sofie-emberplus-connection/commit/ebf013aafe795a1fc2cb107ebcd7a7cce5c77ca1)
* **`berEncode` and `berDecode`:** `berEncode` takes an `EncodableRoot`, a root with the `RootType` of its kind (`berEncode(...root)` passes one on). `berDecode` returns a `DecodedRoot`, which says its `rootType`, and is still assignable to `DecodeResult<Root>`. [513b56c](https://github.com/phillipivan/sofie-emberplus-connection/commit/513b56c4e20c3957dc30227e00e7b51d3d044736)
* **`EmberTypedValue`** is a union, its `value` tied to its `type`. Build each type with a value of its form, or narrow the type first. [0ccd539](https://github.com/phillipivan/sofie-emberplus-connection/commit/0ccd539f903d3b6477dfb7e441c1b82b16d8ab37)
* **`Parameter`** is a union of `TypedParameter<T>`, one per `ParameterType`, with the value and default tied to the type; `ParameterImpl<T>` is generic. Code that implements or extends `Parameter`, or builds a parameter whose value doesn't match its type, needs changing. [36b8fab](https://github.com/phillipivan/sofie-emberplus-connection/commit/36b8fab26e2be086ef29affa98ad6ad30a347750)
* **`DecodeResult.errors`** is required: give an empty list when there are no errors. [dd78d20](https://github.com/phillipivan/sofie-emberplus-connection/commit/dd78d2030c0d9beb7bed32cb14dd926173be035f)
* **`Types.literal`** is removed: use a type annotation or `satisfies`. [60818cf](https://github.com/phillipivan/sofie-emberplus-connection/commit/60818cf8fcee80bfb8e5753faab055f6f251cc67)
* **`RelativeOID`** is a template literal type, a numeric path such as `'1.2.3'`. Narrow a string with `Types.isRelativeOID` before passing it where a `RelativeOID` is expected. [f89c775](https://github.com/phillipivan/sofie-emberplus-connection/commit/f89c775f98983859aabdd8e87ef6e81968f75d07)
* **`Matrix.identifier`** is optional, as a matrix's contents are: a matrix decoded without contents has no identifier (it had `''`). [53c0e4b](https://github.com/phillipivan/sofie-emberplus-connection/commit/53c0e4b11769d54afa3f494ef67b4aac2694a3d0)
* **Request responses** are typed as what answers them, and a reply of another kind rejects: `getDirectory`, `subscribe` and `unsubscribe` resolve with a `RootElement` (they were typed `Root | RootElement` and `Root | void`), `setValue` with an `ElementOf<Parameter>`, and the matrix requests with an `ElementOf<Matrix>`. [2e818c2](https://github.com/phillipivan/sofie-emberplus-connection/commit/2e818c255a3a39cbe537cb3019d292f840625e97)

### Behaviour changes

* **Requests send only what they are about,** as the specification's examples and Lawo's libember do: `setValue` the path and the value, a matrix request the path and the connection, a command the path and the command. [92544a5](https://github.com/phillipivan/sofie-emberplus-connection/commit/92544a532f0e08e789566cea032853ebbf85468e) [9a31ef7](https://github.com/phillipivan/sofie-emberplus-connection/commit/9a31ef7605d6b7c4485bb81486fe542243f0067e) [0dc5143](https://github.com/phillipivan/sofie-emberplus-connection/commit/0dc5143aee07a27dac396654aaaf4b785a42578c)
* **Values must fit their parameter's type.** `setValue` refuses one that doesn't before sending, and the encoder refuses one instead of coercing it; typed values are written as their type says. A decoded value or default that doesn't fit is left out with an error, and the client doesn't apply one from an update. A decoded limit that isn't an integer, real or null is left out with an error. [f48ad51](https://github.com/phillipivan/sofie-emberplus-connection/commit/f48ad512ecbb2185efc21d1fa632d00e6325a1f9) [89c0b14](https://github.com/phillipivan/sofie-emberplus-connection/commit/89c0b142894375e2b2773c3bdd2553df602cd0d7) [811fd7e](https://github.com/phillipivan/sofie-emberplus-connection/commit/811fd7e6e66e31724f38d6863ee422e45f5e2c68) [6ab189d](https://github.com/phillipivan/sofie-emberplus-connection/commit/6ab189d071d11c48ee9956f9d508b65b8e5442ae) [ddc6e70](https://github.com/phillipivan/sofie-emberplus-connection/commit/ddc6e70607bceab45a3986dfc41e724c881eb8f6) [ec88e60](https://github.com/phillipivan/sofie-emberplus-connection/commit/ec88e60f935727f23e44883cadf1f78b4b55a698)
* **Encoding:** `writeInt` writes and reads integers up to 64 bits, and throws on NaN, ±Infinity and anything larger. A parameter's `templateReference` is written as a RELATIVE-OID, so one that isn't a numeric path throws. An Enum value is written as an INTEGER, a Trigger value by its JavaScript type, and an untyped Buffer as an OCTET STRING. A null value is written as NULL, and keeps its parameter's type when decoded. [dbcd286](https://github.com/phillipivan/sofie-emberplus-connection/commit/dbcd286461457192c87047ac5a3ffc7f757ef45d) [fff9f1f](https://github.com/phillipivan/sofie-emberplus-connection/commit/fff9f1f79d16cfed32ddb150d4c3bf06ad6c8763) [cde13e2](https://github.com/phillipivan/sofie-emberplus-connection/commit/cde13e2273117a36f278005ac0f549689ce16292) [6eeb078](https://github.com/phillipivan/sofie-emberplus-connection/commit/6eeb07882e05aafc28f36611a9a5ef37969554f6)
* **Decoding:** an unknown command decodes as `CommandType.Unknown`, which `EmberServer` ignores; an unknown parameter access decodes as read-only; an invocation result without `success` is a success. Root elements are kept in the order they came, keyed by place. Elements the Glow DTD doesn't allow where they are are left out, with an error. [3dd3bdb](https://github.com/phillipivan/sofie-emberplus-connection/commit/3dd3bdbdcc4c7f623ac4421dfdd4956406eee836) [f9b4ff3](https://github.com/phillipivan/sofie-emberplus-connection/commit/f9b4ff31fdcccf59079e9d1bc759409abbe256ee) [5027bf0](https://github.com/phillipivan/sofie-emberplus-connection/commit/5027bf04aba8b47473a2efe3242241e243270d82) [4e103e6](https://github.com/phillipivan/sofie-emberplus-connection/commit/4e103e6112b2828beef43125f6a0012740df9f37) [d7bd7b3](https://github.com/phillipivan/sofie-emberplus-connection/commit/d7bd7b3e4ac3b31ce3fb1285f5cd557b53b5e53f)
* **S101:** frames are read whatever their slot; packets of a DTD other than Glow are dropped; frames with a command or message type the codec doesn't handle are passed over without an error. A 0xF8 byte outside an escaping frame starts a non-escaping frame. [22ef42f](https://github.com/phillipivan/sofie-emberplus-connection/commit/22ef42f8a1030ad1ccecdd0ae7e1f05ef60fd19a) [f179a5c](https://github.com/phillipivan/sofie-emberplus-connection/commit/f179a5c8f32e8b16aa317ff48c20a901dfee23e6) [ccb6b68](https://github.com/phillipivan/sofie-emberplus-connection/commit/ccb6b684dd870e740d24ef499e0eba97ade8e383) [ea737ad](https://github.com/phillipivan/sofie-emberplus-connection/commit/ea737ad3882b9826c10ef53b1664fad1a13b101f) [a93e9e3](https://github.com/phillipivan/sofie-emberplus-connection/commit/a93e9e386f62866e1b276688fd2c2b7fdb020cc0)
* **Client:** `getElementByPath` doesn't wait for the extra GetDirectory it sends on a parameter. A GetDirectory or Subscribe on a template is refused: its encoding has no place for a command. [df52977](https://github.com/phillipivan/sofie-emberplus-connection/commit/df52977d71361bf18af522e99da322697e9f2305) [a1e16f5](https://github.com/phillipivan/sofie-emberplus-connection/commit/a1e16f54e42eaca1684331db80a7ccee91da9820)
* **Matrix requests** naming a target or source the matrix doesn't have are refused before sending, when the matrix's lists (or a linear matrix's counts) tell; `Model.hasSignal` tells whether a matrix has a signal. A provider ignores such a request, as the XACI does, so it only timed out. [d00707b](https://github.com/phillipivan/sofie-emberplus-connection/commit/d00707b347a96c7338982e027677509fa6635774)
* **`EmberServer`** hands `onInvocation` only an Invoke on a function, answering any other with a failure, and passes over roots from consumers that aren't elements. [eccdf66](https://github.com/phillipivan/sofie-emberplus-connection/commit/eccdf6677525c42f371dbc956178c908b781c2c8) [513b56c](https://github.com/phillipivan/sofie-emberplus-connection/commit/513b56c4e20c3957dc30227e00e7b51d3d044736)
* **`EmberServer` matrix connections** naming a target or source the matrix doesn't have are dropped before `onMatrixOperation`, which gets the rest of the request, and `updateMatrixConnection` refuses such a change; a new `warn` event says what was dropped and why. A real target is answered with its current state, a target that doesn't exist not at all. [047398a](https://github.com/phillipivan/sofie-emberplus-connection/commit/047398ac2aba901f39cfccf0c95606098a1a8dbd)

### Features

* **S101 non-escaping frames** (variant 2) are read, and a keep-alive request in that form is answered in kind. [a93e9e3](https://github.com/phillipivan/sofie-emberplus-connection/commit/a93e9e386f62866e1b276688fd2c2b7fdb020cc0) [8e3358d](https://github.com/phillipivan/sofie-emberplus-connection/commit/8e3358d0df4a9098377a25ac6e62b32190482e9b)
* **Reconnecting** backs off from 5 s to a minute, and the client restores its subscriptions with the provider after a reconnect. [d8673d0](https://github.com/phillipivan/sofie-emberplus-connection/commit/d8673d0c4fd84255f5dd7338192686c0eb58a1e3) [4180483](https://github.com/phillipivan/sofie-emberplus-connection/commit/4180483f9e11d6b5148b8074efcaf9bd6d1ea97c)
* **Matrix labels:** `EmberClient.getMatrixLabels(matrix)` fetches every label set of a matrix, in the order it lists them, as `LabelSet`s (each signal's label by number). [c764376](https://github.com/phillipivan/sofie-emberplus-connection/commit/c76437609dd2b6cccc16dc7d0f1e87dc9330c690)
* **Matrix parameters:** `matrixParametersPath`, `matrixTargetParametersPath`, `matrixSourceParametersPath`, `matrixConnectionParametersPath` and `matrixConnectionGainPath` give the paths of a matrix's signal and connection parameters, from its `parametersLocation`. [c764376](https://github.com/phillipivan/sofie-emberplus-connection/commit/c76437609dd2b6cccc16dc7d0f1e87dc9330c690)
* **Matrix signal contents:** `targetContents` and `sourceContents` keep each target's and source's contents (`identifier`, `isOnline`, `labelsLocation`), by number. [e3d8a6d](https://github.com/phillipivan/sofie-emberplus-connection/commit/e3d8a6dccedf8583d9785d50869e091a92cf8c13)
* **Paths:** `getElementByPath` loads the top level (a GetDirectory on the root) when it doesn't have the path's first element and none has been sent; it found nothing until the caller had sent one. Lookups made together share one request; one that fails rejects the lookup, and the next lookup sends another. [28f32d4](https://github.com/phillipivan/sofie-emberplus-connection/commit/28f32d47c7f9dc82e0e7b6a0971cbec5248fc56c)
* **Debug logging:** `setDebugLogging(enabled, log?)` turns the library's debug output on or off at any time, to the caller's logger or to `console.log`. [761e0e0](https://github.com/phillipivan/sofie-emberplus-connection/commit/761e0e04a61dc5201529913f86dd6100345e39b9)
* **Exports:** the types the public API takes, returns and emits, from the package root; from `Model`, the type guards `isEmberElement`, `isNumbered`, `isQualified`, `isInvoke`, `isGetDirectory`, `isConnection` and `isConnections`, and the parameter helpers `TypedParameter`, `ParameterValue`, `isValueOfType` and `fitsItsType`; from `Types`, `ElementOf`, `QualifiedCommand`, `CommandableElementType` and `isRelativeOID`. [ed46c21](https://github.com/phillipivan/sofie-emberplus-connection/commit/ed46c21cd5d7673b1faade37b0570a1a7881845c) [0eddce4](https://github.com/phillipivan/sofie-emberplus-connection/commit/0eddce49a69e47ebf64539325ebed214d0d4f0fe) [df56db5](https://github.com/phillipivan/sofie-emberplus-connection/commit/df56db59e292e619ea72b51c3c135cb87ca3f16c) [8ca2a63](https://github.com/phillipivan/sofie-emberplus-connection/commit/8ca2a636ba3b686780d71f4b970e85c7b9f9cc8e) [089e092](https://github.com/phillipivan/sofie-emberplus-connection/commit/089e09288f341000672495f3ff70f7e4dd1b0320) [a1e16f5](https://github.com/phillipivan/sofie-emberplus-connection/commit/a1e16f54e42eaca1684331db80a7ccee91da9820) [2e818c2](https://github.com/phillipivan/sofie-emberplus-connection/commit/2e818c255a3a39cbe537cb3019d292f840625e97) [f89c775](https://github.com/phillipivan/sofie-emberplus-connection/commit/f89c775f98983859aabdd8e87ef6e81968f75d07)
* **ASN.1:** the BER coder is part of the library, not a dependency. [2a47353](https://github.com/phillipivan/sofie-emberplus-connection/commit/2a4735310bf595423353af8b60e288a9087a48f5)

### Bug Fixes

* **BER and Glow decoding:** matrix lists and invocation arguments in the indefinite length form; matrix messages without contents; targets and sources with signal contents; tags in the multi-byte form; lengths of four bytes or more (read as unsigned, in any number of bytes); RELATIVE-OID values; an INTEGER without contents (0); a BOOLEAN from its first byte; an enumeration entry without a name; a message whose data ends early no longer makes the decoder loop. [1600cb7](https://github.com/phillipivan/sofie-emberplus-connection/commit/1600cb781b1ff514120596b6fc5321cb19384c55) [f0f8b4f](https://github.com/phillipivan/sofie-emberplus-connection/commit/f0f8b4fd06c7955964198148b4d900bd0967c6e8) [9cb4e78](https://github.com/phillipivan/sofie-emberplus-connection/commit/9cb4e78603e9336f0e592df8d6c11662a0d773fd) [3032fdd](https://github.com/phillipivan/sofie-emberplus-connection/commit/3032fdd7e0cafd7f67ea5b1ed24b1e466d9be83a) [7e11344](https://github.com/phillipivan/sofie-emberplus-connection/commit/7e113444d8e4885e8213bdfc6fd9679cdc7d9564) [2ec528d](https://github.com/phillipivan/sofie-emberplus-connection/commit/2ec528df200678063298fe55d8d1f9dbb4ceca3d) [e83ac6f](https://github.com/phillipivan/sofie-emberplus-connection/commit/e83ac6f397758d68dc48ff5c724dd2636c2fc4ac) [27622ac](https://github.com/phillipivan/sofie-emberplus-connection/commit/27622ac7344ebc0edac0c61028ca9152786f87c3) [c786f67](https://github.com/phillipivan/sofie-emberplus-connection/commit/c786f67c9818d21b8cb234695b5086fd2e1af6a3) [e2a02a9](https://github.com/phillipivan/sofie-emberplus-connection/commit/e2a02a9825f623a6748d0048af886ef3fcc0753b) [007b201](https://github.com/phillipivan/sofie-emberplus-connection/commit/007b2018e6f9e4561dd3e8619adb63b7ff2cfb81) [0de0308](https://github.com/phillipivan/sofie-emberplus-connection/commit/0de0308f96327f5cdc68f7ebf157b9a4b82a70cd) [6445212](https://github.com/phillipivan/sofie-emberplus-connection/commit/6445212bac911ed30355f7fdf3975a013ba035d6) [a892dd5](https://github.com/phillipivan/sofie-emberplus-connection/commit/a892dd599b73c07891ac134a8081a9098f199aaa)
* **Messages cut short:** a message of indefinite lengths that ends before its blocks do is refused: `berDecode` throws, and the socket emits the error. It decoded as an empty tree without errors, so a request it answered timed out. [f791fdb](https://github.com/phillipivan/sofie-emberplus-connection/commit/f791fdb472fa6db1c9a0c81eaf8c9571b2fa8f1f)
* **BER and Glow encoding:** a REAL's exponent length, and -0.0, as libember writes them; tags numbered from 31 up; a parameter's minimum and maximum as MinMax; a matrix parameters location of one or two parts as a path; `writeOID` refuses a single arc; the writer's buffer grows to at least what it needs, also when a sequence's length takes four bytes, and a size or growth factor of 0 means the default. [637d3ea](https://github.com/phillipivan/sofie-emberplus-connection/commit/637d3ea6fce6fecfa75f0d7bc87e38b64f13548c) [149d96f](https://github.com/phillipivan/sofie-emberplus-connection/commit/149d96fd1f1caf424474d145d23bc9bf9acd57fd) [568bd74](https://github.com/phillipivan/sofie-emberplus-connection/commit/568bd745e22b6c28584eaa1c4b68c5ad4fe16049) [64eeaab](https://github.com/phillipivan/sofie-emberplus-connection/commit/64eeaab61a669677eda69ec9baf89d95cadbe119) [48a4993](https://github.com/phillipivan/sofie-emberplus-connection/commit/48a4993b3518994594028dfcb2494956cd79f329) [3f09e85](https://github.com/phillipivan/sofie-emberplus-connection/commit/3f09e85b94a679615cde19f89f5b19334da379b1) [89cdb51](https://github.com/phillipivan/sofie-emberplus-connection/commit/89cdb514f8d454a91b47e495d349d4a5de80ef04) [a1410bb](https://github.com/phillipivan/sofie-emberplus-connection/commit/a1410bb8b62242ca4be9293638a17ea4731e9e66)
* **S101:** frames restart at every BOF and short frames are dropped; a rejected frame no longer drops the rest of the read; each message is decoded once; stream collections are told from element trees in multi-frame messages; listeners get a copy of each single-packet payload; the app bytes give the Glow DTD version 2.50; frames and packets have a size limit, and a connection that exceeds it is closed. [46d1ae4](https://github.com/phillipivan/sofie-emberplus-connection/commit/46d1ae4d147084a4856d486cc47d6ea4d243915f) [ea503f6](https://github.com/phillipivan/sofie-emberplus-connection/commit/ea503f6daa0a8d2bc35cf255fc9cd1ad253a5cb8) [0b1b65f](https://github.com/phillipivan/sofie-emberplus-connection/commit/0b1b65fcf4a7900358411c6088f47d3aa7579dbe) [e4532c4](https://github.com/phillipivan/sofie-emberplus-connection/commit/e4532c491a48282c839224871c176371a2369109) [cff740b](https://github.com/phillipivan/sofie-emberplus-connection/commit/cff740b870ef172a994b795c37520575b64be663) [1a118d9](https://github.com/phillipivan/sofie-emberplus-connection/commit/1a118d97d9d045d73f2ab7eec42deeb3ce799c0c) [ff1d9ec](https://github.com/phillipivan/sofie-emberplus-connection/commit/ff1d9eca29073d78a48ef7f7f00e2147c7a1b137) [f7c725a](https://github.com/phillipivan/sofie-emberplus-connection/commit/f7c725a7f977d54dd19e180772d1abc4da5bc664) [a6b5913](https://github.com/phillipivan/sofie-emberplus-connection/commit/a6b5913e24c6fe48b102720a87adb1a8e2781f16)
* **Client connection:** subscription updates no longer go missing, and the socket's life cycle is reliable; a replaced or failed connect attempt's timeout no longer destroys the current socket; reconnecting stops when the client is disconnected or discarded; `connect()` settles when it doesn't start an attempt. [a20fc63](https://github.com/phillipivan/sofie-emberplus-connection/commit/a20fc638619b2cf436d73ea6663283367f502b9e) [90fdb73](https://github.com/phillipivan/sofie-emberplus-connection/commit/90fdb73b15c8cc453226260b4faa9aa8b0677f74) [7b0f809](https://github.com/phillipivan/sofie-emberplus-connection/commit/7b0f8095e9131dc5ac94c04b947c96b27bc8ce9a) [00fb374](https://github.com/phillipivan/sofie-emberplus-connection/commit/00fb374f6ac52f753a76dd60be59067138be1f8d)
* **Client tree and requests:** a root GetDirectory's reply is merged into the loaded tree and resolves the request; a GetDirectory on a matrix, function or template resolves when the reply has no children; every property a provider reports is taken; an element's callbacks are called once per reply; a numbered path's segments match by number only; a qualified element whose parent isn't loaded is reported, and one put into the tree is a numbered element its children have as parent; a request about an element the tree doesn't have yet is answered; an Invoke is resolved only by its invocation's result; unsubscribing from a node forgets its parameters' subscriptions. [e602fcb](https://github.com/phillipivan/sofie-emberplus-connection/commit/e602fcb2ecf50de47b4a6c10eda754365a3329a5) [02448c1](https://github.com/phillipivan/sofie-emberplus-connection/commit/02448c15bd6460404eca9513c7cd5167c7294ddd) [7a6246e](https://github.com/phillipivan/sofie-emberplus-connection/commit/7a6246eb8a82539465b8bd8366e3b5fd63893cda) [90f47e3](https://github.com/phillipivan/sofie-emberplus-connection/commit/90f47e39ad29cab0fbcbe03a81a8b7ed7944ee7b) [e8f65c6](https://github.com/phillipivan/sofie-emberplus-connection/commit/e8f65c60da63a1c5382688cf3fc01973bf9eb76a) [aef1116](https://github.com/phillipivan/sofie-emberplus-connection/commit/aef1116e17ae1011e1b1daec1f406b32997a81d0) [2010dc7](https://github.com/phillipivan/sofie-emberplus-connection/commit/2010dc7359974b81a35160146100e408b0692973) [fa00b7b](https://github.com/phillipivan/sofie-emberplus-connection/commit/fa00b7b8040e7f7869081c7fec434067d6374284) [af75640](https://github.com/phillipivan/sofie-emberplus-connection/commit/af75640ccab85a0011c4aec37d001370264684a4) [9cbe73a](https://github.com/phillipivan/sofie-emberplus-connection/commit/9cbe73ae5e861ba7bd33b35369ae535bbfbeacef) [6447c1a](https://github.com/phillipivan/sofie-emberplus-connection/commit/6447c1a265d6cd4b144f549f145ef689f6a35cfa)
* **Empty nodes:** a GetDirectory on a node without children is settled by the empty node a provider answers with (the spec's sign that it has none), also when the node's parent or its device isn't loaded; such a request timed out. [42664bd](https://github.com/phillipivan/sofie-emberplus-connection/commit/42664bd0f0619e55d78eefb11263a3d587083004)
* **Client matrices:** a report covering some targets keeps the other connections; connections are looked up by target and stored by what their disposition means. [2397a3c](https://github.com/phillipivan/sofie-emberplus-connection/commit/2397a3cdb2201d26432f954efc8879b8feafc965) [dc63b42](https://github.com/phillipivan/sofie-emberplus-connection/commit/dc63b42f60f1a6f829ba872b0c22d59bedb39956) [9f3eac4](https://github.com/phillipivan/sofie-emberplus-connection/commit/9f3eac43ab55d6ae89485d71d48a1f5d1269cc16)
* **Client streams:** stream identifier 0 is accepted; REAL values are reported; octets are read in the format the stream descriptor gives; a path's callbacks get its stream values. [c77407a](https://github.com/phillipivan/sofie-emberplus-connection/commit/c77407a9d26404f78955893f029e3fd59911aede) [15a8018](https://github.com/phillipivan/sofie-emberplus-connection/commit/15a8018c22ccb088893e9f465ba457f20c0e1ec0) [a1db48d](https://github.com/phillipivan/sofie-emberplus-connection/commit/a1db48dd7eef85a7357b81248470fe2fa16739bf) [9faec4e](https://github.com/phillipivan/sofie-emberplus-connection/commit/9faec4e6082b1f9d94aaf472eed31af38f9e77b0)
* **`EmberServer`:** a parameter's subscription path is its parent's; a consumer is listed once per subscribed path and removed completely; an element's changes go to the consumers subscribed to it; a consumer's setValue and matrix connection requests are always answered; matrix connects follow the matrix's type and an n-to-n matrix's connect limits; `update()` keeps a matrix's other connections, and refuses connections that aren't any. [4c122ea](https://github.com/phillipivan/sofie-emberplus-connection/commit/4c122ea5b1ebd94cbfe00b1d7b658b9dbbb62cb2) [6484393](https://github.com/phillipivan/sofie-emberplus-connection/commit/6484393df70fdc4de2c603f0e6f20afeee3329ca) [61af489](https://github.com/phillipivan/sofie-emberplus-connection/commit/61af4897e841cdc7466d19f61d9412cbf733e135) [e32a58c](https://github.com/phillipivan/sofie-emberplus-connection/commit/e32a58c20c2899cb0f61e5a28203d7b3a0f684bb) [0e64509](https://github.com/phillipivan/sofie-emberplus-connection/commit/0e64509ff28451fdb847e7f743dd58a5acc602b3) [804439f](https://github.com/phillipivan/sofie-emberplus-connection/commit/804439f2989515d8c820e9b52eea064699670da8) [7f9602b](https://github.com/phillipivan/sofie-emberplus-connection/commit/7f9602bed5b5d61aac627911418d83ea2931c4a5) [b8bd4b3](https://github.com/phillipivan/sofie-emberplus-connection/commit/b8bd4b325b624b8652bf9c7bbf42136b35acaa34) [089e092](https://github.com/phillipivan/sofie-emberplus-connection/commit/089e09288f341000672495f3ff70f7e4dd1b0320)

### Refactors

* **Typing:** no `any` and a single documented cast left in the library's code, with type guards, generic helpers and runtime checks in their place, and `noUncheckedIndexedAccess` on. [e2bb1de](https://github.com/phillipivan/sofie-emberplus-connection/commit/e2bb1de9cab4f254742ff82160bef4d571ac92e8) [cc609f5](https://github.com/phillipivan/sofie-emberplus-connection/commit/cc609f5305ec3b7d276ea9e9382b2cb18c0ad661) [6763712](https://github.com/phillipivan/sofie-emberplus-connection/commit/67637128742ac23e65ea3bf4f80be409967e4d86) [310c99f](https://github.com/phillipivan/sofie-emberplus-connection/commit/310c99f5e715f1a58de872eeb33e65269fe1a81e) [68d1d43](https://github.com/phillipivan/sofie-emberplus-connection/commit/68d1d43714a3eee83c8f2abd53e0f19b4306f6c9) [0881698](https://github.com/phillipivan/sofie-emberplus-connection/commit/08816982169e86bf7b50c5e15548bbadc25e1776) [723ffe2](https://github.com/phillipivan/sofie-emberplus-connection/commit/723ffe2f815b8ec79d3c242e5acdd2abcba9365e) [baaee92](https://github.com/phillipivan/sofie-emberplus-connection/commit/baaee92500b1f46ff0d679ad0a1b8273406b14c8) [df56db5](https://github.com/phillipivan/sofie-emberplus-connection/commit/df56db59e292e619ea72b51c3c135cb87ca3f16c) [6457c24](https://github.com/phillipivan/sofie-emberplus-connection/commit/6457c244624415e84bc61e91502b7aae4ea31f7e) [375cef1](https://github.com/phillipivan/sofie-emberplus-connection/commit/375cef157711c33df9208ab58c1614aad7609d3b) [27063dd](https://github.com/phillipivan/sofie-emberplus-connection/commit/27063dd1c78b43cf62f804b5abc746c6b8b82cb0) [d312fe4](https://github.com/phillipivan/sofie-emberplus-connection/commit/d312fe4cafb3d39ae458f04ceecd1ee9b183db48) [bf60f5f](https://github.com/phillipivan/sofie-emberplus-connection/commit/bf60f5f50112ee1fbe24010f6b14016e91f98f6e)
* **Dead code:** the matrix encoder's unused `elementTypeToInt` is removed, and `writeValue`'s separate path for an empty Buffer, which `writeBuffer` writes as it is. [94a40f3](https://github.com/phillipivan/sofie-emberplus-connection/commit/94a40f355291086b064fc0793708b0facec0e5b7) [beb56ec](https://github.com/phillipivan/sofie-emberplus-connection/commit/beb56ec1fcefc7a97f81fe656dd3895533dcb8c5)

### Chores

* Update dependencies, TypeScript 6 and the code standard preset 4. [9e004e5](https://github.com/phillipivan/sofie-emberplus-connection/commit/9e004e515808ec0f482009fe2bbd505ca33e90e6) [05c2614](https://github.com/phillipivan/sofie-emberplus-connection/commit/05c2614ca2269cb04eccea4fc32b0f3691fdca94) [21f66db](https://github.com/phillipivan/sofie-emberplus-connection/commit/21f66db61897d6e6fa3c3faaedc94eba8d3fb266) [6a78597](https://github.com/phillipivan/sofie-emberplus-connection/commit/6a78597fd052c2bc730cbf28a4bd7d743befb1ab) [07354db](https://github.com/phillipivan/sofie-emberplus-connection/commit/07354dbfda3f89a5baef09472feafab69b1759b3) [77ce771](https://github.com/phillipivan/sofie-emberplus-connection/commit/77ce77106c95000f4810820e3de88a25411bb3b1)
* CI tests on Node 22 to 26 and publishes with npm trusted publishing; the package scripts set up the git hooks on install; ESLint forbids `any` in the library's code. [9fa23e9](https://github.com/phillipivan/sofie-emberplus-connection/commit/9fa23e947e560b7eab6969f978e698454bdb5be8) [cc6938b](https://github.com/phillipivan/sofie-emberplus-connection/commit/cc6938b731712d05d7cfd151280531d80b62840c) [e49f638](https://github.com/phillipivan/sofie-emberplus-connection/commit/e49f638b9c51a693c8203a3e0af9c55d2900781f) [1bec0a3](https://github.com/phillipivan/sofie-emberplus-connection/commit/1bec0a32ceb8cb1dde67829203664a4b2352c69c)
* Remove references to the old repository name, CODEOWNERS and Sofie-specific files; update the README and Yarn configuration. [4599144](https://github.com/phillipivan/sofie-emberplus-connection/commit/459914448d0f45d61466c8bf3f2175e01399687b) [190c128](https://github.com/phillipivan/sofie-emberplus-connection/commit/190c128cc37a8e52aea13cf0101809b42bbed056) [145a8fa](https://github.com/phillipivan/sofie-emberplus-connection/commit/145a8fa1f22c5b8636e757ac9011bd6207c3a9f7) [4027980](https://github.com/phillipivan/sofie-emberplus-connection/commit/4027980de0b817effe5705bf0b790408911fa479) [21d56a7](https://github.com/phillipivan/sofie-emberplus-connection/commit/21d56a77c29d78aaae67ba5a879e6639a0610fa5)
* Tests compare the BER, Glow and S101 coding with Lawo's libember, libs101 and libember_slim, and decode packets captured from devices; test housekeeping. [3b141be](https://github.com/phillipivan/sofie-emberplus-connection/commit/3b141be303e249c16d549fb2e67094b881862e02) [a90d4a1](https://github.com/phillipivan/sofie-emberplus-connection/commit/a90d4a175a54f6d59d99f6a56e6eefa19e8669b3) [00da6f9](https://github.com/phillipivan/sofie-emberplus-connection/commit/00da6f9a5285c21bdf2dd71b520b5976eeb2a484) [e45c2be](https://github.com/phillipivan/sofie-emberplus-connection/commit/e45c2bebb1ccc22490d103666a5139f1c854bd4d) [74fb694](https://github.com/phillipivan/sofie-emberplus-connection/commit/74fb694da2d308816f93d6794d1bc40a48160d6e) [e31ed23](https://github.com/phillipivan/sofie-emberplus-connection/commit/e31ed237a5999a6ec7ed2a82c9b6febe5f93efc5)

## [0.4.5](https://github.com/phillipivan/sofie-emberplus-connection.git/compare/v0.4.4...v0.4.5) (Fri Aug 15 2025)

* Bind `debug` function to console.log [b985110](https://github.com/phillipivan/sofie-emberplus-connection/commit/b9851102a38d98b52718bed5bbb0ed3f868ae0f1)

## [0.4.4](https://github.com/phillipivan/sofie-emberplus-connection.git/compare/v0.4.3...v0.4.4) (Wed Aug 13 2025)

* Use `gdnet-asn1` library [a7a0200](https://github.com/phillipivan/sofie-emberplus-connection/commit/a7a0200abf0781fb04b23005bdc67965624c45a6)

## [0.4.3](https://github.com/phillipivan/sofie-emberplus-connection.git/compare/v0.4.2...v0.4.3) (Mon Aug 04 2025)

### Features

* Set EmberClientOptions.reconnectAttempts to -ve value to make infinite[65f14d9](https://github.com/phillipivan/sofie-emberplus-connection/commit/65f14d9cf12155efa4b8059d24439a7ad922bed8)

## [0.4.2](https://github.com/phillipivan/sofie-emberplus-connection/compare/v0.4.1...v0.4.2) (Sun Aug 03 2025)

### Chores

* Change package name [5a8511e](https://github.com/phillipivan/sofie-emberplus-connection/commit/5a8511eccfaa0640b14467bc9b54fb169e260a9c)
* Update to Typescript 5 [56b6cb7] (https://github.com/phillipivan/sofie-emberplus-connection/commit/56b6cb7e6e11052c6bcfcc674a94b9b9f5b043e5)
* Update smart-buffer to 4.2 [dd048c2] (https://github.com/phillipivan/sofie-emberplus-connection/commit/dd048c22391d203f41701ab8fd7e4f5ee2a1ab24)
* Update yarn & husky [5301a92] (https://github.com/phillipivan/sofie-emberplus-connection/commit/5301a9263346dfbd9634989ac1763448d1e5d66f)

## [0.4.1](https://github.com/phillipivan/sofie-emberplus-connection/compare/...v0.4.1) (Fri Aug 01 2025)

### Features

* S101 Client: add reconnectAttempts option to constructor [54f76dd](https://github.com/phillipivan/sofie-emberplus-connection/commit/54f76ddff5228859d71a7c0b254d04e3c6f69d84)
* Ember Client: define EmberClientOptions interface. Add reconnectAttempts & getDirectoryOnParams options [72afb03](https://github.com/phillipivan/sofie-emberplus-connection/commit/72afb03b707b2ca9b20facf13c071074dbb277a6)

### Chores

* Update dependencies [ec4af27](https://github.com/phillipivan/sofie-emberplus-connection/commit/ec4af27afc16d22577caca87d9e46cc423382070)

## [0.3.0](https://github.com/nrkno/sofie-emberplus-connection/compare/v0.2.2...v0.3.0) (Mon Feb 17 2025)

### Features

* revert gitignore to non dist branch [e9fe8ba](https://github.com/nrkno/sofie-emberplus-connection/commit/e9fe8bae60d0bbf06ea238770c425b0bb7b91766)
* cleanup console.logs prior to PR [c30b120](https://github.com/nrkno/sofie-emberplus-connection/commit/c30b120856a5aeba76664d576fb80a3617fae5f2)
* treat data in chunks handling only escaped characters [74dca29](https://github.com/nrkno/sofie-emberplus-connection/commit/74dca299038d735bb8967aa0294e51dd86fb48d2)
* remove ratelimit in streamManager (as one is added in dataIn() [2ddaeda](https://github.com/nrkno/sofie-emberplus-connection/commit/2ddaeda24cfc0cf0afca828e4b6da486337e2b02)
* optimisation in dataIn() - iterate over frames instead of each byte [5847f0a](https://github.com/nrkno/sofie-emberplus-connection/commit/5847f0a02156d632cb53b5b151f838b01e2d5ffb)
* cap limit on streams in dataIn() [1d5ba59](https://github.com/nrkno/sofie-emberplus-connection/commit/1d5ba59155bc73dc2133976403cd61b430706139)
* Simplify stream handling to parse meter data without BER decoding [560fd54](https://github.com/nrkno/sofie-emberplus-connection/commit/560fd546f313332298999f79cb2a9db621770256)
* ratelimit meter updates [48d50bc](https://github.com/nrkno/sofie-emberplus-connection/commit/48d50bc7e5f019ba4026524cbcc1d9fa39fbcedb)
* update mc2 mocks [180bbce](https://github.com/nrkno/sofie-emberplus-connection/commit/180bbcef8b5a551483af9c002e858399e55cf87f)
* optimise StreamManage with identifier lookup table [be86a3d](https://github.com/nrkno/sofie-emberplus-connection/commit/be86a3dddd7a66a70dbf67575760fdd0186eee30)
* Streamanager log if unregistered update [477e0f8](https://github.com/nrkno/sofie-emberplus-connection/commit/477e0f88f2e88bb78ee8fbfb23817b5acaf17d82)
* example of r3lay patchbay streaming [2de55f5](https://github.com/nrkno/sofie-emberplus-connection/commit/2de55f5c24fa87e5d3f8cdc095a027c3456d2038)
* add debugging in S101Client [3b95449](https://github.com/nrkno/sofie-emberplus-connection/commit/3b9544914e4943ad782eecc0da91fd0daac9a7b7)
* add a MC2_mock.js in examples folder [a532c3b](https://github.com/nrkno/sofie-emberplus-connection/commit/a532c3bc7a93c05c1fd1cc9c3f3b36e029e3651e)
* update tests to client's internal StreamManager [bb60778](https://github.com/nrkno/sofie-emberplus-connection/commit/bb6077816f0410a94fee820fbcb5a72749538787)
* update README.md [616d8cc](https://github.com/nrkno/sofie-emberplus-connection/commit/616d8ccc96c81fc2771c5926e812b5134a9f18fa)
* StreamManager is only used internally [e2d5072](https://github.com/nrkno/sofie-emberplus-connection/commit/e2d5072ad0b6da5521dc70ccf4de2911c9733e32)
* separate emberPackets and emberStreamPackets [c00bb10](https://github.com/nrkno/sofie-emberplus-connection/commit/c00bb108abcca329d9cdf6a25a8a420fabd20824)
* getInternalNodePath() to handle that there's no path on numbered Tree nodes and this must be calculated. [99541a0](https://github.com/nrkno/sofie-emberplus-connection/commit/99541a0317010b12f780b6851b2347612e7c2dd4)
* cleaup code from first stream implementation [1284b28](https://github.com/nrkno/sofie-emberplus-connection/commit/1284b2828a15fb9f787ce53ecebcc7e992ec2e2c)
* use path to register streams and handle decoding in StreamManager [a396b0d](https://github.com/nrkno/sofie-emberplus-connection/commit/a396b0d9e708d00d8de507370a946f33132a9c5d)
* StreamManager class for handling stream subscriptions [2b638fd](https://github.com/nrkno/sofie-emberplus-connection/commit/2b638fd6adff9800a3998060c7029eacee8b6f10)

### Fixes

* isEmberStreampacket() function to ensure different size of stream packages [1022745](https://github.com/nrkno/sofie-emberplus-connection/commit/10227455e7b49309c4d66ff09083a52e97be3ceb)
* add stream cap limit in new chunk based structure [143d6ca](https://github.com/nrkno/sofie-emberplus-connection/commit/143d6caf88daf50fd43f14e76d7369301f07c2f1)
* look for streaming data in the correct posistion [e49c42f](https://github.com/nrkno/sofie-emberplus-connection/commit/e49c42f1cc2ac6f6efb1708ab8561539d3dbe4d7)
* extract correct values from raw streamPackage [091de84](https://github.com/nrkno/sofie-emberplus-connection/commit/091de8447898d96e81a89dded36edcdb91c802b4)
* read correct streamIdentifier in parseStreamPacket [e79cc5f](https://github.com/nrkno/sofie-emberplus-connection/commit/e79cc5fb2c8d0bd6b4c2bfb015e26209f8737a2a)
* remove unwanted extensive log in client [e6d9fc8](https://github.com/nrkno/sofie-emberplus-connection/commit/e6d9fc8bc40529714ca835c201df477b853deb8a)
* ensure value on offset [1c85dac](https://github.com/nrkno/sofie-emberplus-connection/commit/1c85dac94ce169824576e0fdc00e27dd345564c6)
* only register a parameter once [eb0f9e7](https://github.com/nrkno/sofie-emberplus-connection/commit/eb0f9e7574f812436f60cbd2ada706f231834e90)
* emit emberStreamTree if stream packet [3e0aff9](https://github.com/nrkno/sofie-emberplus-connection/commit/3e0aff9dec8b5a24354263f50d6018243536c007)
* handle single stream packets [2e8d917](https://github.com/nrkno/sofie-emberplus-connection/commit/2e8d91724110ffd5e0c61720b47a6a19450076c0)
* multiPacket can also be non stream packets [7346f7d](https://github.com/nrkno/sofie-emberplus-connection/commit/7346f7d2cf89b92be9ea6bb882078545298ba77e)
* revert check if node is a parameter [684609a](https://github.com/nrkno/sofie-emberplus-connection/commit/684609aebfa0c7e658d861f420a1dde0cf127284)
* StreamManager should not be a singleton [22d61b9](https://github.com/nrkno/sofie-emberplus-connection/commit/22d61b9bd75d984981a0b1b0eeb0911bb0a5ef68)
* handle integer stream type [bb3ca20](https://github.com/nrkno/sofie-emberplus-connection/commit/bb3ca20b8e5727909a471d457fac6b7a2d41bdbc)
* StreamManager test use real values. [63dea41](https://github.com/nrkno/sofie-emberplus-connection/commit/63dea41999a6365d1029f6744780a123f0be6de2)
* streamEntry.value can be zero [60a0e8f](https://github.com/nrkno/sofie-emberplus-connection/commit/60a0e8ffc75fd35265e002e5ca87c274c4d819a8)
* handle offset=0 [78c1660](https://github.com/nrkno/sofie-emberplus-connection/commit/78c16601a94a8fc3d1facb29b6cb44342594764b)
* some Ember implementations has an empty string as identifier [d46a5a3](https://github.com/nrkno/sofie-emberplus-connection/commit/d46a5a37dcf015e38141e37854059319a62d631b)

## [0.2.2](https://github.com/nrkno/sofie-emberplus-connection/compare/v0.2.1...v0.2.2) (Fri Sep 20 2024)


### Fixes

* extra getDir for parameters to explicitly express interest in value changes [c6f684c](https://github.com/nrkno/sofie-emberplus-connection/commit/c6f684cc3d4870c971de3446360464fae055b284)
* **(Provider)** handle getDirectory on empty node correctly [8abda16](https://github.com/nrkno/sofie-emberplus-connection/commit/8abda1609cb19bf77d6d5548c34437d7ce7b9d62)
* handle getDirectory on root multiple times [cb375cc](https://github.com/nrkno/sofie-emberplus-connection/commit/cb375cc41ac2f3205b970fc6a13fa533ae0b362e)
* handle getDirectory on paramater [e8f131d](https://github.com/nrkno/sofie-emberplus-connection/commit/e8f131d096641bff1d36acef90a18b9d0a31353a)

## [0.2.1](https://github.com/nrkno/sofie-emberplus-connection/compare/v0.2.0...v0.2.1) (Mon Oct 16 2023)


## [0.2.0](https://github.com/nrkno/sofie-emberplus-connection/compare/v0.1.2...v0.2.0) (Mon Oct 16 2023)


### Fixes

* Setting 2 full path properties fails SOFIE-2628 (#34) [3d756ae](https://github.com/nrkno/sofie-emberplus-connection/commit/3d756aec59998015d4f0f331720dcb517d677b43)
* children should be stored in object [ee926d2](https://github.com/nrkno/sofie-emberplus-connection/commit/ee926d21cafc3368dac152daa122b35310aa2c6a)
* :bug: relative to issue #32 [70e8333](https://github.com/nrkno/sofie-emberplus-connection/commit/70e8333294a79db518729604fb0ac7e8e68cc9bb)
* implement timeout for keepalive requests [d59b7b2](https://github.com/nrkno/sofie-emberplus-connection/commit/d59b7b2a0418ce16fcf3f7ed384beb0346562f63)

### Features

* use typed eventemitter3 [ff3551e](https://github.com/nrkno/sofie-emberplus-connection/commit/ff3551e3667ffd39148745184058f8664adbde03)

### [0.1.2](https://github.com/nrkno/sofie-emberplus-connection/compare/v0.0.2...v0.1.2) (2022-01-17)


### ⚠ BREAKING CHANGES

* drop node 10 support

### Features

* emberplus provider ([babc51c](https://github.com/nrkno/sofie-emberplus-connection/commit/babc51c7b9f328d36fc0e327dfde2a60255d1ee6))
* optional path delimiter ([b7bf058](https://github.com/nrkno/sofie-emberplus-connection/commit/b7bf058ce192dfb863374eadbb783f706f01b777)), closes [#17](https://github.com/nrkno/sofie-emberplus-connection/issues/17)


### Bug Fixes

* **ber:** enum value is encoded as int ([4e2267a](https://github.com/nrkno/sofie-emberplus-connection/commit/4e2267a0e9a5b4be02e62d628361666b7cbf7e8b))
* client socket should send keepAlives ([88534e2](https://github.com/nrkno/sofie-emberplus-connection/commit/88534e2a77e5b39913f70136afa90863e67ae9da))
* codecov ([3db375b](https://github.com/nrkno/sofie-emberplus-connection/commit/3db375b03f72b25f41bc39a0dc2e6b817f8f779d))
* empty parameter type ([d69e0d7](https://github.com/nrkno/sofie-emberplus-connection/commit/d69e0d72b86d7230bbf52dc55609c0850ced87a4))
* increase robustness in connection / invocation decoder ([ef28575](https://github.com/nrkno/sofie-emberplus-connection/commit/ef28575e0835f8e3f3d682898d4d24647fb8b8c1))
* **provider:** build correct path from children in request [publish] ([7dcfda5](https://github.com/nrkno/sofie-emberplus-connection/commit/7dcfda5937f85cb2cf8066620d6a1beb22da0e69))
* **provider:** catch and emit errors from clients ([cdece29](https://github.com/nrkno/sofie-emberplus-connection/commit/cdece29a4210381704bface783d227f3b8af857a))
* **provider:** requests consisting of NumberedTreeNodes ([732e393](https://github.com/nrkno/sofie-emberplus-connection/commit/732e3935a252d668c7ca0eee569b34e20a4bd49a))
* Updated since the repo name has changed ([3917fc8](https://github.com/nrkno/sofie-emberplus-connection/commit/3917fc850dbc722655e17bcf11b002117ad0f758))


* drop node 10 support ([2753c36](https://github.com/nrkno/sofie-emberplus-connection/commit/2753c3665ba649926511e11a3df8f58683e127fe))

### [0.1.1](https://github.com/nrkno/sofie-emberplus-connection/compare/0.1.0...0.1.1) (2022-01-17)


### Bug Fixes

* codecov ([3db375b](https://github.com/nrkno/sofie-emberplus-connection/commit/3db375b03f72b25f41bc39a0dc2e6b817f8f779d))

## [0.1.0](https://github.com/nrkno/sofie-emberplus-connection/compare/0.0.4...0.1.0) (2022-01-17)

### ⚠ BREAKING CHANGES

- drop node 10 support

### Features

- optional path delimiter ([b7bf058](https://github.com/nrkno/sofie-emberplus-connection/commit/b7bf058ce192dfb863374eadbb783f706f01b777)), closes [#17](https://github.com/nrkno/sofie-emberplus-connection/issues/17)

### Bug Fixes

- empty parameter type ([d69e0d7](https://github.com/nrkno/sofie-emberplus-connection/commit/d69e0d72b86d7230bbf52dc55609c0850ced87a4))
- Updated since the repo name has changed ([3917fc8](https://github.com/nrkno/sofie-emberplus-connection/commit/3917fc850dbc722655e17bcf11b002117ad0f758))

- drop node 10 support ([2753c36](https://github.com/nrkno/sofie-emberplus-connection/commit/2753c3665ba649926511e11a3df8f58683e127fe))

### [0.0.4](https://github.com/nrkno/tv-automation-emberplus-connection/compare/0.0.3...0.0.4) (2020-12-01)

### Bug Fixes

- **provider:** build correct path from children in request [publish] ([7dcfda5](https://github.com/nrkno/tv-automation-emberplus-connection/commit/7dcfda5937f85cb2cf8066620d6a1beb22da0e69))
- **provider:** requests consisting of NumberedTreeNodes ([732e393](https://github.com/nrkno/tv-automation-emberplus-connection/commit/732e3935a252d668c7ca0eee569b34e20a4bd49a))

### [0.0.3](https://github.com/nrkno/tv-automation-emberplus-connection/compare/v0.0.2...v0.0.3) (2020-08-17)

### Features

- emberplus provider ([babc51c](https://github.com/nrkno/tv-automation-emberplus-connection/commit/babc51c7b9f328d36fc0e327dfde2a60255d1ee6))

### Bug Fixes

- **provider:** catch and emit errors from clients ([cdece29](https://github.com/nrkno/tv-automation-emberplus-connection/commit/cdece29a4210381704bface783d227f3b8af857a))
- client socket should send keepAlives ([88534e2](https://github.com/nrkno/tv-automation-emberplus-connection/commit/88534e2a77e5b39913f70136afa90863e67ae9da))
- increase robustness in connection / invocation decoder ([ef28575](https://github.com/nrkno/tv-automation-emberplus-connection/commit/ef28575e0835f8e3f3d682898d4d24647fb8b8c1))
- **ber:** enum value is encoded as int ([4e2267a](https://github.com/nrkno/tv-automation-emberplus-connection/commit/4e2267a0e9a5b4be02e62d628361666b7cbf7e8b))

### 0.0.2 (2020-06-08)

### Features

- basic type predicate for Parameter interface ([19570fe](https://github.com/nrkno/tv-automation-emberplus-connection/commit/19570fe3709aa5986863099d8ccd3e9d9e390659))
- Ber.Reader converted to TypeScript ([3858f61](https://github.com/nrkno/tv-automation-emberplus-connection/commit/3858f619fabe71cf1f7f48ff0a4295fe2de888e6))
- Ber.Writer converted to TypeScript ([bea3219](https://github.com/nrkno/tv-automation-emberplus-connection/commit/bea3219491cfb7b6a0c88ccb0a581955f406a916))
- convert error classes to typescript ([adb4cc4](https://github.com/nrkno/tv-automation-emberplus-connection/commit/adb4cc4bc94911c6c130b53cc52d87714385f3b8))
- create library index ([fc9d513](https://github.com/nrkno/tv-automation-emberplus-connection/commit/fc9d513c522c1dafe15da78365d34961a7c32caa))
- forgiving decoder ([03c72c5](https://github.com/nrkno/tv-automation-emberplus-connection/commit/03c72c5e2875d0e97df817ad3a088ae59adf8197))
- hack setValue to immediately resolve - added setValueWithHacksaw() function from NRKNO fork ([3b382b7](https://github.com/nrkno/tv-automation-emberplus-connection/commit/3b382b7352dfde79e295b94956f1f76a765dd5e8))
- library skeleton ([5d0c922](https://github.com/nrkno/tv-automation-emberplus-connection/commit/5d0c922012a6ae55b3bba843af4da6f763061666))
- reconnection logic (ported from nrkno/develop branch) ([232d508](https://github.com/nrkno/tv-automation-emberplus-connection/commit/232d5086cc3644297d961c1e0a2b5ad1446a45d4))
- remove creation of a new reader for each tag ([e64d11d](https://github.com/nrkno/tv-automation-emberplus-connection/commit/e64d11dfcae956e137f69e2a17d591da757fd19d))
- resends, timeouts, refactor for collections ([138241d](https://github.com/nrkno/tv-automation-emberplus-connection/commit/138241d1ac6af8ee4a1a10ab4b45ed85e9f808b9))
- separate method for ber encoding ember+ data structures ([4b9f947](https://github.com/nrkno/tv-automation-emberplus-connection/commit/4b9f9471024e7c915be71c371b3ed719c3be541f))
- setValueNoAck - rename of function and cleanup ([82618c3](https://github.com/nrkno/tv-automation-emberplus-connection/commit/82618c3ccc13b6355c893a47bafd1d226c7e86ae))
- type predicate function for EmberElement interface ([331f623](https://github.com/nrkno/tv-automation-emberplus-connection/commit/331f623eee4583c8b13f6b53f3dee1ade7c48638))
- **ber encoding:** Adds type to Ember.ParameterContents objects. Allows for explicitly setting Real ParameterContents types to enforce correct encoding. ([153eed8](https://github.com/nrkno/tv-automation-emberplus-connection/commit/153eed853b31eeaf5f79b76bf603ba01e2c4e177))
- **Functions:** Adds Invoke method for QualifiedFunctions with InvocationResult. ([9013dfe](https://github.com/nrkno/tv-automation-emberplus-connection/commit/9013dfea6b2392ca97f6e4423a3a98d5b6f087bb))

### Bug Fixes

- add missing code, pass tests ([dd3d884](https://github.com/nrkno/tv-automation-emberplus-connection/commit/dd3d88430f421b43f9f3b613cfccc2e0beb4ab2e))
- better error message for getEleByPath ([8c1c5be](https://github.com/nrkno/tv-automation-emberplus-connection/commit/8c1c5bee5f95e13298fe318af1be00349c34a92d))
- changes is an array [publish] ([f41e58d](https://github.com/nrkno/tv-automation-emberplus-connection/commit/f41e58d832ed6a19d5220eba04c4b54427d0a482))
- convert tree arrays into collections ([6974cc9](https://github.com/nrkno/tv-automation-emberplus-connection/commit/6974cc9085fee76e9cf30f980c32c6a374de8f41))
- do not expand functions and offline nodes ([fad784e](https://github.com/nrkno/tv-automation-emberplus-connection/commit/fad784e3cef4d635021fc8a2774a03ee30117a5c))
- fix Ber writeReal and writeValue ([d39e90a](https://github.com/nrkno/tv-automation-emberplus-connection/commit/d39e90a746f5c41ff45f8f08231c5885b22bbc2c))
- getDirectory on node should auto subscribe to child modification ([66578f0](https://github.com/nrkno/tv-automation-emberplus-connection/commit/66578f008ab3f7c127bdcfbb1dc2247deb675a77))
- handle indefinite lengths and empty contents ([34f7ff3](https://github.com/nrkno/tv-automation-emberplus-connection/commit/34f7ff3bd90345126ff92e1ffc6b9b617e5f6e55))
- make linting job actually work ([d7eef92](https://github.com/nrkno/tv-automation-emberplus-connection/commit/d7eef926fc864324b1dc9b10c63c6faf02d372a1))
- missing continue for error recovery ([9b3935f](https://github.com/nrkno/tv-automation-emberplus-connection/commit/9b3935f91e6a02173eefe48b796b5f118f1ee720))
- missing skipNext for error recovery ([53b7434](https://github.com/nrkno/tv-automation-emberplus-connection/commit/53b74344c5a644a95112bb049f30ab1881cf3216))
- promise didn´t resolve ([9110000](https://github.com/nrkno/tv-automation-emberplus-connection/commit/91100007882c08b814b84424726ea21543e4345d))
- reading and writing NULL values ([fcf979e](https://github.com/nrkno/tv-automation-emberplus-connection/commit/fcf979eb78a5c8acecbc83f3e6a2cc947fb4c3d0))
- write zero-length buffers and null parameters ([d910ef6](https://github.com/nrkno/tv-automation-emberplus-connection/commit/d910ef64a8426d6c90d24d54603642a74344c1e7))
- **ber encoding:** Fixed unecessary nesting of ParameterContents if using strong typed ParameterContents ([1661251](https://github.com/nrkno/tv-automation-emberplus-connection/commit/16612512a242232f9595c02265d16e7efbe77d61))
- **KeepAliveRequest:** Fixes broken KeepAlieveRequest. ([8a99bb6](https://github.com/nrkno/tv-automation-emberplus-connection/commit/8a99bb624c695f76bf9ae30b3a0d63e413bdcd52))
