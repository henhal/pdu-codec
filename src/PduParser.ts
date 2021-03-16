import ByteBuffer from "bytebuffer";
import {BitLength, Endian, Word} from './types';

type Dict<K extends string = string> = Record<K, unknown>;

type Reader<T, U extends Dict, V extends Dict> = (x: T, value: V) => U | void;

type ReaderOrPropertyName<T, U extends Dict, V extends Dict> = Reader<T, U, V> | (keyof U & string);

function simpleReader<T, U extends Dict, V extends Dict>(propertyName: keyof U): Reader<T, U, V> {
  return (x: T) => ({[propertyName]: x} as U);
}

function getReader<T, U extends Dict, V extends Dict>(readerOrPropertyName: ReaderOrPropertyName<T, U, V>) {
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

  readonly endian: Endian;

  /**
   * The current value produced by merging all records returned by the reader callbacks.
   */
  value: T;

  private constructor(hex: string, {target, endian}: {target: T, endian: Endian}) {
    this.buf = ByteBuffer.wrap(hex, 'hex', endian === Endian.LITTLE, false);
    this.value = target;
    this.endian = endian;
  }

  /**
   * Create a parser from the given hex string
   * @param hex Hex data to parse
   * @param options Options
   * @param [options.target = {}] Initial target object
   * @param [options.endian = Endian.BIG] Endian
   * @returns PduParser for the given data
   */
  static parse<T extends Dict = Dict<never>>(hex: string, {
    target = {} as T,
    endian = Endian.BIG
  }: {
    target: T,
    endian: Endian
  }): PduParser<T> {
    return new PduParser(hex, {target, endian});
  }

  private fail(message: string): never {
    throw new Error(message);
  }

  private assign<U extends Dict>(value: U | void): PduParser<T & U> {
    Object.assign(this.value, value);

    return this as PduParser<T & U>;
  }

  private readNumber(bits: BitLength): number {
    switch (bits) {
      case 8:
        return this.buf.readUint8();
      case 16:
        return this.buf.readUint16();
      case 32:
        return this.buf.readUint32();
      default:
        this.fail('Invalid number of bits');
    }
  }

  private readNumbers<U extends Dict, B extends BitLength>(
      bits: B,
      ...args: [ReaderOrPropertyName<Word<B>, U, T>] | [number, ReaderOrPropertyName<Array<Word<B>>, U, T>]
  ): PduParser<T & U> {
    if (typeof args[0] === 'number') {
      const [count, arrayReader] = args as [number, ReaderOrPropertyName<number[], U, T>];
      const values = [];

      for (let i = 0; i < count; i++) {
        values.push(this.readNumber(bits));
      }

      return this.assign(getReader(arrayReader)(values, this.value));
    }

    const [reader] = args as [ReaderOrPropertyName<number, U, T>];

    return this.assign(getReader(reader)(this.readNumber(bits), this.value));
  }

  /**
   * From the buffer, read a single unsigned word of the given bit length.
   * @param bits   Number of bits per number
   * @param reader Word reader
   */
  number<U extends Dict, B extends BitLength>(
      bits: B,
      reader: ReaderOrPropertyName<Word<B>, U, T>
  ): PduParser<T & U>;

  /**
   * From the buffer, read "count" words of the given bit length.
   * @param bits   Number of bits per number
   * @param count  Number of words to read
   * @param reader Word array reader
   */
  number<U extends Dict, B extends BitLength>(
      bits: B,
      count: number,
      reader: ReaderOrPropertyName<Array<Word<B>>, U, T>
  ): PduParser<T & U>;

  number<U extends Dict, B extends BitLength>(
      bits: B,
      ...args: [ReaderOrPropertyName<Word<B>, U, T>] | [number, ReaderOrPropertyName<Array<Word<B>>, U, T>]
  ): PduParser<T & U> {
    return this.readNumbers(bits, ...args);
  }

  /**
   * From the buffer, read a single unsigned byte
   * @param reader Byte reader
   */
  uint8<U extends Dict>(
      reader: ReaderOrPropertyName<Word<8>, U, T>
  ): PduParser<T & U>;

  /**
   * From the buffer, read "count" unsigned bytes
   * @param count  Number of bytes to read
   * @param reader Byte array reader
   */
  uint8<U extends Dict>(
      count: number,
      reader: ReaderOrPropertyName<Array<Word<8>>, U, T>
  ): PduParser<T & U>;

  uint8<U extends Dict>(
      ...args: [ReaderOrPropertyName<Word<8>, U, T>] | [number, ReaderOrPropertyName<Array<Word<8>>, U, T>]
  ): PduParser<T & U> {
    return this.readNumbers(8, ...args);
  }

  /**
   * From the buffer, read a single unsigned 16-bit word
   * @param reader Word reader
   */
  uint16<U extends Dict>(reader: ReaderOrPropertyName<number, U, T>): PduParser<T & U>;

  /**
   * From the buffer, read "count" unsigned 16-bit words
   * @param count  Number of words to read
   * @param reader Word array reader
   */
  uint16<U extends Dict>(count: number, reader: ReaderOrPropertyName<number[], U, T>): PduParser<T & U>;

  uint16<U extends Dict>(
      ...args: [ReaderOrPropertyName<number, U, T>] | [number, ReaderOrPropertyName<number[], U, T>]
  ): PduParser<T & U> {
    return this.readNumbers(16, ...args);
  }

  /**
   * From the buffer, read a single unsigned 32-bit word
   * @param reader Word reader
   */
  uint32<U extends Dict>(reader: ReaderOrPropertyName<number, U, T>): PduParser<T & U>;

  /**
   * From the buffer, read "count" unsigned 32-bit words
   * @param count  Number of words to read
   * @param reader Word array reader
   */
  uint32<U extends Dict>(count: number, reader: ReaderOrPropertyName<number[], U, T>): PduParser<T & U>;

  uint32<U extends Dict>(
      ...args: [ReaderOrPropertyName<number, U, T>] | [number, ReaderOrPropertyName<number[], U, T>]
  ): PduParser<T & U> {
    return this.readNumbers(32, ...args);
  }

  /**
   * From the buffer, read a string, optionally preceded by a length word of given bit length and parse it as UTF-8.
   * @param reader Reader to convert string into record
   * @param options Options
   * @param [options.lengthBits] Number of bits in length word
   * @param [options.nullTerminate] Whether to string is terminated with null byte
   */
  string<U extends Dict>(reader: Reader<string, U, T>, {
    lengthBits = 8,
    nullTerminate = false,
  }: {
    lengthBits?: BitLength;
    nullTerminate?: boolean;
  } = {}): PduParser<T & U> {
    let str: string;

    if (lengthBits) {
      const len = this.readNumber(lengthBits);
      str = this.buf.readUTF8String(len);
    } else if (nullTerminate) {
      str = this.buf.readCString();
    } else {
      this.fail('Cannot parse string without length or null terminator');
    }

    return this.assign(reader(str, this.value));
  }

  /**
   * From the buffer, read a length byte followed by <length> bytes.
   * Parse it as a hex string of the given length.
   * @param reader Reader to convert hex string into record
   * @param options Options
   * @param [options.lengthBits] Number of bits in length word; 0 for no length word
   * @param [options.length]     Number of bytes to read; required if no length word is present
   */
  hex<U extends Dict>(reader: Reader<string, U, T>, {
    lengthBits = 8,
    length,
  }: {
    lengthBits?: BitLength;
    length?: number;
  } = {}): PduParser<T & U> {
    const len = lengthBits ? this.readNumber(lengthBits) : length;

    if (typeof len !== 'number') this.fail(`Must provide length or length bits`);

    const value = len > 0 ?
        this.buf.readBytes(len).buffer.toString('hex') :
        '';

    return this.assign(reader(value, this.value));
  }
}