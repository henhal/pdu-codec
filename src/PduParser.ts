import ByteBuffer from "bytebuffer";

type Dict<K extends string = string> = Record<K, unknown>;

type Reader<T, U extends Dict, V extends Dict> = (x: T, value: V) => U | void;

/**
 * An APDU parser with chainable read methods building an object from the merged objects
 * returned from each reader callback.
 */
export default class PduParser<T extends Dict = Dict> {
  private readonly buf: ByteBuffer;

  /**
   * The current value produced by merging all records returned by the reader callbacks.
   */
  value: T;

  private constructor(data: string, value: T) {
    this.buf = ByteBuffer.wrap(data, 'hex');
    this.value = value;
  }

  /**
   * Create a parser from the given hex string
   * @param data Hex data to parse
   * @param [value] Optional initial value
   * @returns PduParser for the given data
   */
  static parse<T extends Dict = Dict<never>>(data: string, value: T = {} as T): PduParser<T> {
    return new PduParser(data, value);
  }

  private parse<U extends Dict>(value: U | void): PduParser<T & U> {
    Object.assign(this.value, value);

    return this as PduParser<T & U>;
  }

  /**
   * From the buffer, read a single byte and parse it as an unsigned 8-bit number.
   * @param reader Reader to convert number into record
   */
  uint8<U extends Dict>(reader: Reader<number, U, T>): PduParser<T & U>;

  /**
   * From the buffer, read count bytes and parse it as an array of unsigned 8-bit numbers.
   * @param count Number of bytes to read
   * @param reader Reader to convert array of numbers into record
   */
  uint8<U extends Dict>(count: number, reader: Reader<number[], U, T>): PduParser<T & U>;

  uint8<U extends Dict>(
      readerOrCount: Reader<number, U, T> | number,
      arrayReader?: Reader<number[], U, T>
  ): PduParser<T & U> {
    if (typeof readerOrCount === 'number') {
      const count = readerOrCount;
      // Only to please the compiler, if readerOrCount is a number arrayReader must be defined
      if (!arrayReader) throw new Error('Missing reader');

      const values = [];
      for (let i = 0; i < count; i++) {
        values.push(this.buf.readUint8());
      }
      return this.parse(arrayReader(values, this.value));
    }
    const reader = readerOrCount;

    return this.parse(reader(this.buf.readUint8(), this.value));
  }

  /**
   * From the buffer, read two bytes. Parse it as an unsigned 16-bit number (BE).
   * @param reader Reader to convert number into record
   */
  uint16<U extends Dict>(reader: Reader<number, U, T>): PduParser<T & U> {
    return this.parse(reader(this.buf.readUint16(), this.value));
  }

  /**
   * From the buffer, read a length byte followed by <length> bytes.
   * Parse it as a UTF-8 string of the given length.
   * @param reader Reader to convert string into record
   */
  utf8WithLength<U extends Dict>(reader: Reader<string, U, T>): PduParser<T & U> {
    const len = this.buf.readUint8();

    return this.parse(reader(this.buf.readUTF8String(len), this.value));
  }

  /**
   * From the buffer, read a length byte followed by two offset bytes, then <length> bytes.
   * Parse it as a hex string of the given length, and the given offset.
   * @param reader Reader to convert hex string into record
   */
  hexWithLengthOffset<U extends Dict>(reader: (s: string, offset: number, value: T) => U): PduParser<T & U> {
    const len = this.buf.readUint8();
    let offset = 0;
    let value = '';

    if (len > 0) {
      offset = this.buf.readUint16();
      value = this.buf.readBytes(len).buffer.toString('hex');
    }

    return this.parse(reader(value, offset, this.value));
  }
}