/* eslint-disable @typescript-eslint/ban-types */
import ByteBuffer from "bytebuffer";
import {BitLength, Endian, Hex, Word} from './types';

type Dict = object;

type Reader<T, U extends Dict, V extends Dict> = (x: T, value: V, parser: PduParser) => U | void;

type EmptyObject = { }

type Merge<T> = { [K in keyof T]: T[K] } & {};

function error(message: string): never {
  throw new Error(message);
}

function simpleReader<T, U extends Dict, V extends Dict>(propertyName: string): Reader<T, U, V> {
  return (x: T) => ({[propertyName]: x} as U);
}

function getReader<T, U extends Dict, V extends Dict, K extends string>(arg: Reader<T, U, V> | K) {
  return typeof arg === 'string' ?
      simpleReader<T, U, V>(arg) :
      arg as Reader<T, U, V>;
}

export interface PduParserOptions<T extends EmptyObject> {
  target: T,
  endian: Endian;
}

export interface PduParserRepeatOptions {
  times?: number;
  maxTimes?: number;
}

/**
 * An APDU parser with chainable read methods building an object from the merged objects
 * returned from each reader callback.
 */
export default class PduParser<V extends EmptyObject = EmptyObject> {
  private readonly buf: ByteBuffer;

  readonly endian: Endian;

  /**
   * The current value produced by merging all records returned by the reader callbacks.
   */
  value: V;

  private constructor(hex: Hex, options: PduParserOptions<V>) {
    const {target, endian} = options;
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
  static parse<T extends EmptyObject = EmptyObject>(hex: string, options: Partial<PduParserOptions<T>> = {}): PduParser<T> {
    const {
      target = {} as T,
      endian = Endian.BIG
    } = options;

    return new PduParser(hex, {target, endian});
  }

  private fail(message: string): never {
    throw new Error(message);
  }

  private parse<T, U extends Dict, K extends string>(reader: Reader<T, U, V> | K, data: T): PduParser<Merge<V & U>> {
    const value = getReader(reader)(data, this.value, this);

    Object.assign(this.value, value);

    return this as any;
  }

  private readNumber(bits: BitLength): number {
    switch (bits) {
      case 8:
        return this.buf.readUint8() ?? error('Out of buffer');
      case 16:
        return this.buf.readUint16() ?? error('Out of buffer');
      case 32:
        return this.buf.readUint32() ?? error('Out of buffer');
      default:
        this.fail('Invalid number of bits');
    }
  }

  private readNumbers<K extends string, U extends Dict, B extends BitLength>(
      bits: B,
      ...args: [Reader<Word<B>, U, V> | K] | [number, Reader<Array<Word<B>>, U, V> | K]
  ): PduParser<Merge<V & U>> {
    if (typeof args[0] === 'number') {
      const [count, arrayReader] = args as [number, Reader<number[], U, V> | K];
      const values = [];

      for (let i = 0; i < count; i++) {
        values.push(this.readNumber(bits));
      }

      return this.parse(arrayReader, values);
    }

    const [reader] = args as [Reader<number, U, V> | K];

    return this.parse(reader, this.readNumber(bits));
  }

  /**
   * From the buffer, read a single unsigned word of the given bit length.
   * @param bits    Number of bits per number
   * @param reader  Word reader
   */
  number<U extends Dict, B extends BitLength>(
      bits: B,
      reader: Reader<Word<B>, U, V>
  ): PduParser<Merge<V & U>>;

  /**
   * From the buffer, read a single unsigned word of the given bit length.
   * @param bits          Number of bits per number
   * @param propertyName  Name of property to write value to
   */
  number<K extends string, B extends BitLength>(
      bits: B,
      propertyName: K
  ): PduParser<Merge<V & {[P in K]: Word<B>}>>;

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
  ): PduParser<Merge<V & U>>;

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
  ): PduParser<Merge<V & {[P in K]: Word<B>}>>;

  number<U extends Dict, K extends string, B extends BitLength>(
      bits: B,
      ...args: [Reader<Word<B>, U, V>] | [K] | [number, Reader<Array<Word<B>>, U, V>] | [number, K]
  ): PduParser<Merge<V & U>> {
    return this.readNumbers(bits, ...args);
  }

  /**
   * From the buffer, read a single unsigned byte
   * @param reader Byte reader
   */
  uint8<U extends Dict>(
      reader: Reader<Word<8>, U, V>
  ): PduParser<Merge<V & U>>;

  /**
   * From the buffer, read a single unsigned byte
   * @param propertyName Name of property to write value to
   */
  uint8<K extends string>(
      propertyName: K
  ): PduParser<Merge<V & {[P in K]: Word<8>}>>;

  /**
   * From the buffer, read "count" unsigned bytes
   * @param count  Number of bytes to read
   * @param reader Byte array reader
   */
  uint8<U extends Dict>(
      count: number,
      reader: Reader<Array<Word<8>>, U, V>
  ): PduParser<Merge<V & U>>;

  /**
   * From the buffer, read "count" unsigned bytes
   * @param count  Number of bytes to read
   * @param propertyName Name of property to write values to
   */
  uint8<K extends string>(
      count: number,
      propertyName: K
  ): PduParser<Merge<V & {[P in K]: Array<Word<8>>}>>;

  uint8<U extends Dict, K extends string>(
      ...args: [Reader<Word<8>, U, V> | K] | [number, Reader<Array<Word<8>>, U, V> | K]
  ): PduParser<Merge<V & U>> {
    return this.readNumbers(8, ...args);
  }

  /**
   * From the buffer, read a single unsigned 16-bit word
   * @param reader Byte reader
   */
  uint16<U extends Dict>(
      reader: Reader<Word<16>, U, V>
  ): PduParser<Merge<V & U>>;

  /**
   * From the buffer, read a single unsigned 16-bit word
   * @param propertyName Name of property to write value to
   */
  uint16<K extends string>(
      propertyName: K
  ): PduParser<Merge<V & {[P in K]: Word<16>}>>;

  /**
   * From the buffer, read "count" unsigned 16-bit words
   * @param count  Number of 16-bit words to read
   * @param reader Byte array reader
   */
  uint16<U extends Dict>(
      count: number,
      reader: Reader<Array<Word<16>>, U, V>
  ): PduParser<Merge<V & U>>;

  /**
   * From the buffer, read "count" unsigned 16-bit words
   * @param count  Number of 16-bit words to read
   * @param propertyName Name of property to write values to
   */
  uint16<K extends string>(
      count: number,
      propertyName: K
  ): PduParser<Merge<V & {[P in K]: Array<Word<16>>}>>;

  uint16<U extends Dict, K extends string>(
      ...args: [Reader<Word<16>, U, V> | K] | [number, Reader<Array<Word<16>>, U, V> | K]
  ): PduParser<Merge<V & U>> {
    return this.readNumbers(16, ...args);
  }

  /**
   * From the buffer, read a single unsigned 32-bit word
   * @param reader Byte reader
   */
  uint32<U extends Dict>(
      reader: Reader<Word<32>, U, V>
  ): PduParser<Merge<V & U>>;

  /**
   * From the buffer, read a single unsigned 32-bit word
   * @param propertyName Name of property to write value to
   */
  uint32<K extends string>(
      propertyName: K
  ): PduParser<Merge<V & {[P in K]: Word<32>}>>;

  /**
   * From the buffer, read "count" unsigned 32-bit words
   * @param count  Number of 32-bit words to read
   * @param reader Byte array reader
   */
  uint32<U extends Dict>(
      count: number,
      reader: Reader<Array<Word<32>>, U, V>
  ): PduParser<Merge<V & U>>;

  /**
   * From the buffer, read "count" unsigned 32-bit words
   * @param count  Number of 32-bit words to read
   * @param propertyName Name of property to write values to
   */
  uint32<K extends string>(
      count: number,
      propertyName: K
  ): PduParser<Merge<V & {[P in K]: Array<Word<32>>}>>;

  uint32<U extends Dict, K extends string>(
      ...args: [Reader<Word<32>, U, V> | K] | [number, Reader<Array<Word<32>>, U, V> | K]
  ): PduParser<Merge<V & U>> {
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
  }): PduParser<Merge<V & U>>;

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
  }): PduParser<Merge<V & {[P in K]: string}>>;

  string<U extends Dict, K extends string>(reader: Reader<string, U, V> | K, {
    lengthBits = 8,
    nullTerminate = false,
  }: {
    lengthBits?: BitLength | 0;
    nullTerminate?: boolean;
  } = {}): PduParser<Merge<V & U>> {
    let str: string;

    if (lengthBits) {
      const len = this.readNumber(lengthBits);
      str = this.buf.readUTF8String(len, ByteBuffer.METRICS_BYTES);
    } else if (nullTerminate) {
      str = this.buf.readCString();
    } else {
      this.fail('Cannot parse string without length or null terminator');
    }

    return this.parse(reader, str);
  }

  /**
   * From the buffer, read a length byte followed by <length> bytes.
   * Parse it as a hex string of the given length.
   * @param reader Reader to convert hex string into record, or name of property to write value to
   * @param options Options
   * @param [options.lengthBits] Number of bits in length word; 0 for no length word
   * @param [options.length]     Number of bytes to read; required if no length word is present
   */
  hex<U extends Dict>(reader: Reader<Hex, U, V>, options?: {
    lengthBits?: BitLength | 0;
    length?: number;
  }): PduParser<Merge<V & U>>;

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
  }): PduParser<Merge<V & {[P in K]: Hex}>>;

  /**
   * From the buffer, read a length byte followed by <length> bytes.
   * Parse it as a hex string of the given length.
   * @param reader Reader to convert hex string into record, or name of property to write value to
   * @param options Options
   * @param [options.lengthBits] Number of bits in length word; 0 for no length word
   * @param [options.length]     Number of bytes to read; required if no length word is present
   */
  hex<U extends Dict, K extends string>(reader: Reader<Hex, U, V> | K, {
    lengthBits = 8,
    length,
  }: {
    lengthBits?: BitLength | 0;
    length?: number;
  } = {}): PduParser<Merge<V & U>> {
    const len = lengthBits ? this.readNumber(lengthBits) : length;

    if (typeof len !== 'number') this.fail(`Must provide length or length bits`);

    const value = len > 0 ?
        this.buf.readBytes(len).toString('hex') :
        '';

    return this.parse(reader, value);
  }

  repeat<U>(loop: (parser: PduParser<V>) => PduParser<V & U> | null, options: PduParserRepeatOptions = {}): PduParser<Merge<V & U>> {
    const {times, maxTimes} = options;
    let i = 0;

    while (true) {
      if (times != null && i >= times) {
        break;
      }

      if (maxTimes != null && i >= maxTimes) {
        break;
      }

      try {
        const result = loop(this);

        if (result === null) {
          break;
        }
        i++;
      } catch (err) {
        if (times != null && i < times) {
          throw err;
        }
        break;
      }
    }
    return this as any;
  }
}