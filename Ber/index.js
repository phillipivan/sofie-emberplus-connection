const Reader = require("./Reader");
const Writer = require("./Writer");
const CONSTANTS = require("./constants")
const FUNCTIONS = require("./functions")

module.exports = {
  Reader,
  Writer
}

for (const name in CONSTANTS) {
  module.exports[name] = CONSTANTS[name]
}

for (const name in FUNCTIONS) {
  module.exports[name] = FUNCTIONS[name]
}
