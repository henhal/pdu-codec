import ByteBuffer from "bytebuffer";
import {parseHex} from "./utils";
import {BitLength, Endian, Word} from './types';

function getMaxValue(bits: number, maxBits = 32) {
  return Math.pow(2, bits || maxBits) - 1;
}

/**
 * An APDU builder with chainable write methods
 */
export default class PduBuilder {
  private readonly buf: ByteBuffer;
  private readonly marks: Record<string, number> = {};
  private _length = 0;

  readonly endian: Endian;

  /**
   * Constructor
   * @param [options] Options
   * @param [options.initialSize = 20] Initial size of the backing buffer, in bytes
   * @param [options.limit] Max number of bytes allowed in this PDU, default no limit
   * @param [options.endian = Endian.BIG] Endian
   */
  constructor(
      {
        initialSize = 20,
        limit,
        endian = Endian.BIG,
      }: {
        initialSize?: number;
        limit?: number;
        endian?: Endian;
      } = {}) {
    this.buf = ByteBuffer.allocate(initialSize, endian === Endian.LITTLE, false);
    this.endian = endian;

    if (typeof limit === 'number') {
      this.buf.limit = limit;
    }
  }

  private fail(message: string): never {
    throw new Error(message);
  }

  private writeNumber<B extends BitLength>(value: Word<B>, bits: B) {
    const max = getMaxValue(bits);

    if (value < 0 || value > max) this.fail(`Invalid uint${bits} value ${value}`);

    switch (bits) {
      case 8:
        return this.buf.writeUint8(value);
      case 16:
        return this.buf.writeUint16(value);
      case 32:
        return this.buf.writeUint32(value);
      default:
        throw new Error(`Invalid bit length ${bits}`);
    }
  }

  /**
   * Get the remaining bytes of this builder. If a limit was given in the constructor, this is max number
   * of bytes that can be written. If no limit was given, it's the max number of bytes that can be written before
   * the buffer is re-sized.
   */
  remaining(): number {
    return this.buf.limit - this.length;
  }

  /**
   * Get the current position of the buffer
   */
  get offset(): number {
    return this.buf.offset;
  }

  /**
   * Set the current position of the buffer. A value beyond the end of the buffer cannot be set.
   * @param pos Position
   */
  set offset(pos: number) {
    if (pos > this.length) {
      throw new Error(`Cannot set position beyond current length`);
    }
    this.buf.offset = pos;
  }

  /**
   * Get the current length of the buffer
   */
  get length(): number {
    this._length = Math.max(this._length, this.offset);

    return this._length;
  }

  /**
   * Bookmark the current buffer position to enable going back to this position later
   * @param id Bookmark identifier
   */
  saveMark(id: string): this {
    this.marks[id] = this.offset;

    return this;
  }

  /**
   * Go back to a previously bookmarked position
   * @param id Bookmark identifier
   */
  loadMark(id: string): this {
    const offset = this.marks[id];

    if (offset === undefined) {
      throw new Error(`No such mark ${id}`);
    }

    this.offset = offset;

    return this;
  }

  /**
   * Set the current offset to the end of the buffer (after previously using a bookmark)
   */
  end(): this {
    this.offset = this.length;

    return this;
  }

  /**
   * Write one or more unsigned numbers with the specified bit length per number
   * @param bits   Number of bits per number
   * @param values Unsigned byte values
   */
  number<B extends BitLength>(bits: B, ...values: Array<Word<B>>): this {
    for (const value of values) {
      this.writeNumber(value, bits);
    }
    return this;
  }

  /**
   * Write one or more unsigned bytes
   * @param values Unsigned byte values
   */
  uint8(...values: Array<Word<8>>): this {
    return this.number(8, ...values);
  }

  /**
   * Write one or more unsigned 16-bit words
   * @param values Unsigned 16-bit words
   */
  uint16(...values: Array<Word<16>>): this {
    return this.number(16, ...values);
  }

  /**
   * Write one or more unsigned 32-bit words
   * @param values Unsigned 16-bit words
   */
  uint32(...values: Array<Word<32>>): this {
    return this.number(32, ...values);
  }

  /**
   * Write a string as UTF-8, optionally preceded by its length
   * @param str String
   * @param options Options
   * @param [options.lengthBits] Number of bits to use for length word
   * @param [options.minLength] Minimum length of the UTF-8 encoded string in bytes
   * @param [options.maxLength] Maximum length of the UTF-8 encoded string in bytes
   * @param [options.nullTerminate] Whether to add a null byte after the string
   */
  string(str: string, {
    lengthBits = 8,
    minLength = 0,
    maxLength = getMaxValue(lengthBits),
    nullTerminate = false,
  }: {
    lengthBits?: BitLength | 0;
    minLength?: number;
    maxLength?: number;
    nullTerminate?: boolean;
  } = {}): this {
    if (str === undefined) {
      this.fail(`Invalid string ${str}`);
    }

    if (minLength < 0 || maxLength > getMaxValue(lengthBits) || maxLength < minLength) {
      throw new Error(`Invalid min or max length`);
    }

    // Since the string must be encoded as UTF-8, the byte length may not be equal to the code point length,
    // so we use a separate buffer in order to properly get the byte length
    const strBuf = ByteBuffer.allocate(str.length, this.endian === Endian.LITTLE, false);

    if (nullTerminate) {
      strBuf.writeCString(str);
    } else {
      strBuf.writeUTF8String(str);
    }
    strBuf.flip();
    const strLength = strBuf.limit;

    if (strLength < minLength || strLength > maxLength) {
      throw new Error(`Invalid string length ${strLength}; expected [${minLength}..${maxLength}]`);
    }

    if (lengthBits) {
      this.writeNumber(strLength, lengthBits);
    }
    this.buf.append(strBuf);

    return this;
  }

  /**
   * Write a hex string as bytes to the buffer, optionally preceded by a word containing the length of the bytes.
   * @param hex The string
   * @param [options] Options
   * @param [options.lengthBits] Number of bits to use for length word; 0 for no length word
   * @param [options.minLength]  Minimum length of the data in bytes
   * @param [options.maxLength]  Maximum length of the data in bytes
   */
  hex(hex: string | Buffer, {
    lengthBits = 8,
    minLength = 0,
    maxLength = getMaxValue(lengthBits)
  }: {
    lengthBits?: BitLength | 0;
    minLength?: number;
    maxLength?: number;
  } = {}): this {
    const hexBuf = typeof hex === 'string' ? parseHex(hex) : hex;

    if (hexBuf.length < minLength || hexBuf.length > maxLength) {
      this.fail(`Invalid data length ${hexBuf.length}; expected [${minLength}..${maxLength}]`);
    }

    if (lengthBits) {
      this.writeNumber(hexBuf.length, lengthBits);
    }

    if (hexBuf.length > 0) {
      this.buf.append(hexBuf, 'hex');
    }

    return this;
  }

  build(): string {
    return this.buf.toHex(0, this.length);
  }
}