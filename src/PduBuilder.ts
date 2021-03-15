import ByteBuffer from "bytebuffer";
import {parseHex} from "./utils";

enum Endian {
  BIG,
  LITTLE
}

/**
 * An APDU builder with chainable write methods
 */
export default class PduBuilder {
  private readonly buf;
  private readonly marks: Record<string, number> = {};
  private _length = 0;
  readonly endian: Endian;

  constructor(
      {
        initialSize = 20,
        limit,
        endian = Endian.BIG,
      }: {
        initialSize?: number;
        limit?: number;
        endian?: Endian;
      }) {
    this.buf = ByteBuffer.allocate(initialSize, endian === Endian.LITTLE, false);
    this.endian = endian;

    if (limit !== undefined) {
      this.buf.limit = limit;
    }
  }

  private fail(message: string): never {
    throw new Error(message);
  }

  private writeNumber(value: number, bits: 8 | 16) {
    if (bits === 8) {
      this.buf.writeUint8(value);
    } else if (bits === 16) {
      this.buf.writeUint16(value);
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
   * Write one or more unsigned bytes
   * @param values Unsigned byte values
   */
  uint8(...values: number[]): this {
    for (const value of values) {
      if (value < 0 || value > 0xFF) this.fail(`Invalid uint8 value ${value}`);

      this.buf.writeUint8(value);
    }
    return this;
  }

  /**
   * Write one or more unsigned 16-bit words
   * @param values Unsigned 16-bit words
   */
  uint16(...values: number[]): this {
    for (const value of values) {
      if (value < 0 || value > 0xFFFF) this.fail(`Invalid uint16 value ${value}`);

      this.buf.writeUint16(value);
    }
    return this;
  }

  /**
   * Write a string as UTF-8, optionally preceded by its length
   * @param str String
   * @param options Options
   * @param [options.lengthBits] Number of bits to use for length
   * @param [options.minLength] Minimum length of the UTF-8 encoded string in bytes
   * @param [options.maxLength] Maximum length of the UTF-8 encoded string in bytes
   * @param [options.nullTerminate] Whether to add a null byte after the string
   */
  utf8(str: string, {
    lengthBits = 8,
    minLength = 0,
    maxLength = (1 << lengthBits) - 1,
    nullTerminate = false,
  }: {
    lengthBits?: 0 | 8 | 16;
    minLength?: number;
    maxLength?: number;
    nullTerminate?: boolean;
  } = {}): this {
    if (str === undefined) {
      this.fail(`Invalid string ${str}`);
    }

    if (minLength < 0 || maxLength > 0xFF || maxLength < minLength) {
      throw new Error(`Invalid min or max length`);
    }

    // Since the string must be encoded as UTF-8, the byte length may not be equal to the code point length,
    // so we use a separate buffer in order to properly get the byte length
    const strBuf = ByteBuffer.allocate(str.length, this.endian === Endian.LITTLE, false)
        .writeUTF8String(str).buffer;

    if (lengthBits) {
      if (strBuf.length < minLength || strBuf.length > maxLength) {
        throw new Error(`Invalid string length ${strBuf.length}`);
      }
      this.writeNumber(strBuf.length, lengthBits);
    }

    this.buf.append(strBuf);

    if (nullTerminate) {
      this.buf.writeUint8(0x00);
    }
    return this;
  }

  hex(hex: string | Buffer, {
        lengthBits = 8,
        minLength = 0,
        maxLength = (1 << lengthBits) - 1,
      }: {
        lengthBits?: 8 | 16;
        minLength?: number;
        maxLength?: number;
      } = {},
  ): this {
    const hexBuf = typeof hex === 'string' ? parseHex(hex) : hex;

    if (lengthBits) {
      if (hexBuf.length < minLength || hexBuf.length > maxLength) {
        this.fail(`Invalid data length ${hexBuf.length}; expected [${minLength}..${maxLength}]`);
      }

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