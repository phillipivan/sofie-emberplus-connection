function APPLICATION (x) { return x | 0x60; }
function CONTEXT (x) { return x | 0xa0; }
function UNIVERSAL (x) { return x; }

module.exports = {
  APPLICATION,
  CONTEXT,
  UNIVERSAL
}