const Long = require('long');
const { Writer } = require('asn1').Ber;

const { UNIVERSAL } = require('./functions.js');


class ExtendedWriter extends Writer {
  constructor(options) {
    super(options)
  }

  writeReal(value, tag) {
    if (tag === undefined) {
      tag = UNIVERSAL(9)
    }

    this.writeByte(tag);

    switch (value) {
      case 0:
        this.writeLength(0);
        return;
      case Infinity:
        this.writeLength(1);
        this.writeByte(0x40);
        return;
      case -Infinity:
        this.writeLength(1);
        this.writeByte(0x41);
        return;
      default:
        if (isNaN(value)) {
          this.writeLength(1);
          this.writeByte(0x42);
          return;
        }
    }

    const fbuf = Buffer.alloc(8);
    fbuf.writeDoubleLE(value, 0);


    const bits = Long.fromBits(fbuf.readUInt32LE(0), fbuf.readUInt32LE(4), true);

    let significand = bits.and(Long.fromBits(0xFFFFFFFF, 0x000FFFFF, true)).or(
      Long.fromBits(0x00000000, 0x00100000, true));

    let exponent = bits.and(Long.fromBits(0x00000000, 0x7FF00000, true)).shru(52)
      .sub(1023).toSigned();

    while (significand.and(0xFF) == 0) {
      significand = significand.shru(8);
    }

    while (significand.and(0x01) == 0) {
      significand = significand.shru(1);
    }

    exponent = exponent.toNumber();

    exponent = shorten(exponent);
    significand = shortenLong(significand);

    this.writeLength(1 + exponent.size + significand.size);

    const preamble = value < 0 ? 0x80 | 0x40 : 0x80; // in what case will 0x80|0x40 be anything but 0xC0?
    this.writeByte(preamble);

    for (let i = 0; i < exponent.size; i++) {
      this.writeByte((exponent.value & 0xFF000000) >> 24);
      exponent.value <<= 8;
    }

    const mask = Long.fromBits(0x00000000, 0xFF000000, true);
    for (let i = 0; i < significand.size; i++) {
      this.writeByte(significand.value.and(mask).shru(56).toNumber());
      significand.value = significand.value.shl(8);
    }

  }
}

module.exports = ExtendedWriter

function shorten(value) {
  let size = 4;
  while ((((value & 0xff800000) === 0) || ((value & 0xff800000) === 0xff800000 >> 0)) &&
    (size > 1)) {
    size--;
    value <<= 8;
  }

  return { size, value }
}

function shortenLong(value) {
  let mask = Long.fromBits(0x00000000, 0xff800000, true);
  value = value.toUnsigned();

  let size = 8;
  while (value.and(mask).eq(0) || (value.and(mask).eq(mask) && (size > 1))) {
    size--;
    value = value.shl(8);
  }

  return { size, value };
}