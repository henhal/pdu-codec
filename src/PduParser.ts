import ByteBuffer from "bytebuffer";

type Dict<K extends string = string> = Record<K, unknown>;

type Reader<T, U extends Dict, V extends Dict> = (x: T, value: V) => U | void;

function simpleReader<T, U extends Dict, V extends Dict>(propertyName: keyof U): Reader<T, U, V> {
  return (x: T) => ({[propertyName]: x} as U);
}

function getReader<T, U extends Dict, V extends Dict>(readerOrPropertyName: Reader<T, U, V> | keyof U) {
  return typeof readerOrPropertyName === 'string' ?
      simpleReader<T, U, V>(readerOrPropertyName) :
      readerOrPropertyName as Reader<T, U, V>;
}

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

  private readNumber(bits: 8 | 16): number {
    if (bits === 8) {
      return this.buf.readUint8();
    } else if (bits === 16) {
      this.buf.readUint16();
    }
    throw new Error('Invalid number of bits');
  }

  private parseNumber<U extends Dict>(
      readerOrProperty: Reader<number, U, T> | keyof U,
      bits: 8 | 16
  ): PduParser<T & U> {
    // const reader = typeof readerOrProperty === 'string' ?
    //     simpleReader<number, U, T>(readerOrProperty) :
    //     readerOrProperty as Reader<number, U, T>;

    return this.parse(getReader(readerOrProperty)(this.readNumber(bits), this.value));
  }

  private parseNumbers<U extends Dict>(
      count:  number,
      readerOrProperty: Reader<number[], U, T> | keyof U,
      bits: 8 | 16
  ): PduParser<T & U> {
    const values = [];
    for (let i = 0; i < count; i++) {
      values.push(this.readNumber(bits));
    }

    // const reader = typeof arrayReader === 'string' ?
    //     simpleReader<number[], U, T>(arrayReader) :
    //     arrayReader as Reader<number[], U, T>;

    return this.parse(getReader(readerOrProperty)(values, this.value));
  }

  /**
   * From the buffer, read a single byte and parse it as an unsigned 8-bit number.
   * @param reader Reader to convert number into record
   */
  uint8<U extends Dict>(reader: Reader<number, U, T> | keyof U): PduParser<T & U>;

  /**
   * From the buffer, read count bytes and parse it as an array of unsigned 8-bit numbers.
   * @param count Number of bytes to read
   * @param reader Reader to convert array of numbers into record
   */
  uint8<U extends Dict>(count: number, reader: Reader<number[], U, T> | keyof U): PduParser<T & U>;

  uint8<U extends Dict>(
      readerOrCount: Reader<number, U, T> | keyof U | number,
      arrayReader?: Reader<number[], U, T> | keyof U
  ): PduParser<T & U> {
    if (typeof readerOrCount === 'number') {
      // const count = readerOrCount;
      // Only to please the compiler, if readerOrCount is a number arrayReader must be defined
      if (!arrayReader) throw new Error('Missing reader');

      return this.parseNumbers(readerOrCount, arrayReader!, 8);

      // const values = [];
      // for (let i = 0; i < count; i++) {
      //   values.push(this.buf.readUint8());
      // }
      //
      // const reader = typeof arrayReader === 'string' ?
      //     simpleReader<number[], U, T>(arrayReader) :
      //     arrayReader as Reader<number[], U, T>;
      //
      // return this.parse(reader(values, this.value));
    }

    return this.parseNumber(readerOrCount, 8);

    // const reader = typeof readerOrCount === 'string' ?
    //     simpleReader<number, U, T>(readerOrCount) :
    //     readerOrCount as Reader<number, U, T>;
    //
    // return this.parse(reader(this.buf.readUint8(), this.value));
  }

  /**
   * From the buffer, read a single byte and parse it as an unsigned 8-bit number.
   * @param reader Reader to convert number into record
   */
  uint16<U extends Dict>(reader: Reader<number, U, T> | keyof U): PduParser<T & U>;

  /**
   * From the buffer, read count bytes and parse it as an array of unsigned 8-bit numbers.
   * @param count Number of bytes to read
   * @param reader Reader to convert array of numbers into record
   */
  uint16<U extends Dict>(count: number, reader: Reader<number[], U, T> | keyof U): PduParser<T & U>;

  uint16<U extends Dict>(readerOrCount: Reader<number, U, T> | keyof U | number,
                         arrayReader?: Reader<number[], U, T> | keyof U): PduParser<T & U> {
    if (typeof readerOrCount === 'number') {
      // Only to please the compiler, if readerOrCount is a number arrayReader must be defined
      if (!arrayReader) throw new Error('Missing reader');

      return this.parseNumbers(readerOrCount, arrayReader!, 16);
    }

    return this.parseNumber(readerOrCount, 16);
  }

  /**
   * From the buffer, read a length byte followed by <length> bytes.
   * Parse it as a UTF-8 string of the given length.
   * @param reader Reader to convert string into record
   * @param options Options
   * @param [options.lengthBits] Number of bits to use for length
   * @param [options.nullTerminate] Whether to string is terminated with null byte
   */
  utf8<U extends Dict>(reader: Reader<string, U, T>, {
    lengthBits = 8,
    nullTerminate = false,
  }: {
    lengthBits?: 0 | 8 | 16;
    nullTerminate?: boolean;
  } = {}): PduParser<T & U> {
    let str: string;
    if (lengthBits) {
      const len = this.readNumber(lengthBits);
      str = this.buf.readUTF8String(len);
    } else if (nullTerminate) {
      // TODO parse string until null
      throw new Error('TODO');
    } else {
      throw new Error('Cannot parse string without length or null terminator');
    }

    return this.parse(reader(str, this.value));
  }

  /**
   * From the buffer, read a length byte followed by <length> bytes.
   * Parse it as a hex string of the given length-
   * @param reader Reader to convert hex string into record
   * @param options Options
   * @param [options.lengthBits] Number of bits to use for length
   */
  hex<U extends Dict>(reader: Reader<string, U, T>, {
    lengthBits = 8,
  }: {
    lengthBits?: 8 | 16;
  } = {}): PduParser<T & U> {
    const len = this.readNumber(lengthBits);
    const value = len > 0 ?
        this.buf.readBytes(len).buffer.toString('hex') :
        '';

    return this.parse(reader(value, this.value));
  }
}