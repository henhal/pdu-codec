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
export default class PduParser<V extends Dict = Dict> {
  private readonly buf: ByteBuffer;

  readonly endian: Endian;

  /**
   * The current value produced by merging all records returned by the reader callbacks.
   */
  value: V;

  private constructor(hex: string, {target, endian}: {target: V, endian: Endian}) {
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
    target?: T,
    endian?: Endian
  } = {}): PduParser<T> {
    return new PduParser(hex, {target, endian});
  }

  private fail(message: string): never {
    throw new Error(message);
  }

  private assign<U extends Dict>(value: U | void): PduParser<V & U> {
    Object.assign(this.value, value);

    return this as PduParser<V & U>;
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

  private readNumbers<K extends string, U extends Dict, B extends BitLength>(
      bits: B,
      ...args: [Reader<Word<B>, U, V> | K] | [number, Reader<Array<Word<B>>, U, V> | K]
  ): PduParser<V & U> {
    if (typeof args[0] === 'number') {
      const [count, arrayReader] = args as [number, ReaderOrPropertyName<number[], U, V>];
      const values = [];

      for (let i = 0; i < count; i++) {
        values.push(this.readNumber(bits));
      }

      return this.assign(getReader(arrayReader)(values, this.value));
    }

    const [reader] = args as [ReaderOrPropertyName<number, U, V>];

    return this.assign(getReader(reader)(this.readNumber(bits), this.value));
  }

  /**
   * From the buffer, read a single unsigned word of the given bit length.
   * @param bits    Number of bits per number
   * @param reader  Word reader
   */
  number<U extends Dict, B extends BitLength>(
      bits: B,
      reader: Reader<Word<B>, U, V>
  ): PduParser<V & U>;

  /**
   * From the buffer, read a single unsigned word of the given bit length.
   * @param bits          Number of bits per number
   * @param propertyName  Name of property to write value to
   */
  number<K extends string, B extends BitLength>(
      bits: B,
      propertyName: K
  ): PduParser<V & Record<K, Word<B>>>;

  /**
   * From the buffer, read "count" words of the given bit length.
   * @param bits   Number of bits per number
   * @param count  Number of words to read
   * @param reader Word array reader
   */
  number<U extends Dict, B extends BitLength>(
      bits: B,
      count: number,
      reader: Reader<Array<Word<B>>, U, V>
  ): PduParser<V & U>;

  /**
   * From the buffer, read "count" words of the given bit length.
   * @param bits          Number of bits per number
   * @param count         Number of words to read
   * @param propertyName  Name of property to write values to
   */
  number<K extends string, B extends BitLength>(
      bits: B,
      count: number,
      propertyName: K
  ): PduParser<V & Record<K, Word<B>>>;

  number<U extends Dict, K extends string, B extends BitLength>(
      bits: B,
      ...args: [Reader<Word<B>, U, V>] | [K] | [number, Reader<Array<Word<B>>, U, V>] | [number, K]
  ): PduParser<V & U> {
    return this.readNumbers(bits, ...args);
  }

  /**
   * From the buffer, read a single unsigned byte
   * @param reader Byte reader
   */
  uint8<U extends Dict>(
      reader: Reader<Word<8>, U, V>
  ): PduParser<V & U>;

  /**
   * From the buffer, read a single unsigned byte
   * @param propertyName Name of property to write value to
   */
  uint8<K extends string>(
      propertyName: K
  ): PduParser<V & Record<K, Word<8>>>;

  /**
   * From the buffer, read "count" unsigned bytes
   * @param count  Number of bytes to read
   * @param reader Byte array reader
   */
  uint8<U extends Dict>(
      count: number,
      reader: Reader<Array<Word<8>>, U, V>
  ): PduParser<V & U>;

  /**
   * From the buffer, read "count" unsigned bytes
   * @param count  Number of bytes to read
   * @param propertyName Name of property to write values to
   */
  uint8<K extends string>(
      count: number,
      propertyName: K
  ): PduParser<V & Record<K, Word<8>>>;

  uint8<U extends Dict, K extends string>(
      ...args: [Reader<Word<8>, U, V> | K] | [number, Reader<Array<Word<8>>, U, V> | K]
  ): PduParser<V & U> {
    return this.readNumbers(8, ...args);
  }

  /**
   * From the buffer, read a single unsigned 16-bit word
   * @param reader Byte reader
   */
  uint16<U extends Dict>(
      reader: Reader<Word<16>, U, V>
  ): PduParser<V & U>;

  /**
   * From the buffer, read a single unsigned 16-bit word
   * @param propertyName Name of property to write value to
   */
  uint16<K extends string>(
      propertyName: K
  ): PduParser<V & Record<K, Word<16>>>;

  /**
   * From the buffer, read "count" unsigned 16-bit words
   * @param count  Number of 16-bit words to read
   * @param reader Byte array reader
   */
  uint16<U extends Dict>(
      count: number,
      reader: Reader<Array<Word<16>>, U, V>
  ): PduParser<V & U>;

  /**
   * From the buffer, read "count" unsigned 16-bit words
   * @param count  Number of 16-bit words to read
   * @param propertyName Name of property to write values to
   */
  uint16<K extends string>(
      count: number,
      propertyName: K
  ): PduParser<V & Record<K, Word<16>>>;

  uint16<U extends Dict, K extends string>(
      ...args: [Reader<Word<16>, U, V> | K] | [number, Reader<Array<Word<16>>, U, V> | K]
  ): PduParser<V & U> {
    return this.readNumbers(16, ...args);
  }

  /**
   * From the buffer, read a single unsigned 32-bit word
   * @param reader Byte reader
   */
  uint32<U extends Dict>(
      reader: Reader<Word<32>, U, V>
  ): PduParser<V & U>;

  /**
   * From the buffer, read a single unsigned 32-bit word
   * @param propertyName Name of property to write value to
   */
  uint32<K extends string>(
      propertyName: K
  ): PduParser<V & Record<K, Word<32>>>;

  /**
   * From the buffer, read "count" unsigned 32-bit words
   * @param count  Number of 32-bit words to read
   * @param reader Byte array reader
   */
  uint32<U extends Dict>(
      count: number,
      reader: Reader<Array<Word<32>>, U, V>
  ): PduParser<V & U>;

  /**
   * From the buffer, read "count" unsigned 32-bit words
   * @param count  Number of 32-bit words to read
   * @param propertyName Name of property to write values to
   */
  uint32<K extends string>(
      count: number,
      propertyName: K
  ): PduParser<V & Record<K, Word<32>>>;

  uint32<U extends Dict, K extends string>(
      ...args: [Reader<Word<32>, U, V> | K] | [number, Reader<Array<Word<32>>, U, V> | K]
  ): PduParser<V & U> {
    return this.readNumbers(32, ...args);
  }

  /**
   * From the buffer, read a string, optionally preceded by a length word of given bit length and parse it as UTF-8.
   * @param reader Reader to convert string into record
   * @param options Options
   * @param [options.lengthBits] Number of bits in length word
   * @param [options.nullTerminate] Whether to string is terminated with null byte
   */
  string<U extends Dict>(reader: Reader<string, U, V>, options?: {
    lengthBits?: BitLength | 0;
    nullTerminate?: boolean;
  }): PduParser<V & U>;

  /**
   * From the buffer, read a string, optionally preceded by a length word of given bit length and parse it as UTF-8.
   * @param propertyName Name of property to write value to
   * @param options Options
   * @param [options.lengthBits] Number of bits in length word
   * @param [options.nullTerminate] Whether to string is terminated with null byte
   */
  string<K extends string>(propertyName: K, options?: {
    lengthBits?: BitLength | 0;
    nullTerminate?: boolean;
  }): PduParser<V & Record<K, string>>;

  string<U extends Dict, K extends string>(reader: Reader<string, U, V> | K, {
    lengthBits = 8,
    nullTerminate = false,
  }: {
    lengthBits?: BitLength | 0;
    nullTerminate?: boolean;
  } = {}): PduParser<V & U> {
    let str: string;

    if (lengthBits) {
      const len = this.readNumber(lengthBits);
      str = this.buf.readUTF8String(len, ByteBuffer.METRICS_BYTES);
    } else if (nullTerminate) {
      str = this.buf.readCString();
    } else {
      this.fail('Cannot parse string without length or null terminator');
    }

    return this.assign(getReader(reader)(str, this.value));
  }

  /**
   * From the buffer, read a length byte followed by <length> bytes.
   * Parse it as a hex string of the given length.
   * @param reader Reader to convert hex string into record, or name of property to write value to
   * @param options Options
   * @param [options.lengthBits] Number of bits in length word; 0 for no length word
   * @param [options.length]     Number of bytes to read; required if no length word is present
   */
  hex<U extends Dict>(reader: ReaderOrPropertyName<string, U, V>, options?: {
    lengthBits?: BitLength | 0;
    length?: number;
  }): PduParser<V & U>;

  /**
   * From the buffer, read a length byte followed by <length> bytes.
   * Parse it as a hex string of the given length.
   * @param propertyName Name of property to write value to
   * @param options Options
   * @param [options.lengthBits] Number of bits in length word; 0 for no length word
   * @param [options.length]     Number of bytes to read; required if no length word is present
   */
  hex<K extends string>(propertyName: K, options?: {
    lengthBits?: BitLength | 0;
    length?: number;
  }): PduParser<V & Record<K, string>>;

  /**
   * From the buffer, read a length byte followed by <length> bytes.
   * Parse it as a hex string of the given length.
   * @param reader Reader to convert hex string into record, or name of property to write value to
   * @param options Options
   * @param [options.lengthBits] Number of bits in length word; 0 for no length word
   * @param [options.length]     Number of bytes to read; required if no length word is present
   */
  hex<U extends Dict, K extends string>(reader: Reader<string, U, V> | K, {
    lengthBits = 8,
    length,
  }: {
    lengthBits?: BitLength | 0;
    length?: number;
  } = {}): PduParser<V & U> {
    const len = lengthBits ? this.readNumber(lengthBits) : length;

    if (typeof len !== 'number') this.fail(`Must provide length or length bits`);

    const value = len > 0 ?
        this.buf.readBytes(len).toString('hex') :
        '';

    return this.assign(getReader(reader)(value, this.value));
  }
}