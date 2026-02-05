/* eslint-disable @typescript-eslint/ban-types */
import ByteBuffer from "bytebuffer";
import { BitLength, Endian, Hex, Word } from './types';

type Dict = object;
type EmptyObject = {}

type ReaderResult = Dict | PduParser;
type Reader<T, U extends ReaderResult, V extends Dict> = (x: T, value: V, parser: PduParser) => U | void;
type ReaderValue<U extends ReaderResult> = U extends PduParser<infer V> ? V : U;

type Merge<T> = { [K in keyof T]: T[K] } & {};

type DistributedKeys<T> = T extends any ? keyof T : never

type ValueOf<T, K extends DistributedKeys<T>> =
    T extends any ?
        K extends keyof T ? T[K] : never :
        never;

type MergeUnion<T> = {
  [P in DistributedKeys<T>]: P extends keyof T ? T[P] : ValueOf<T, P> | undefined;
} & {};

function simpleReader<T, U extends Dict, V extends Dict>(propertyName: string): Reader<T, U, V> {
  return (x: T) => ({[propertyName]: x} as U);
}

function getReader<T, U extends ReaderResult, V extends Dict, K extends string>(arg: Reader<T, U, V> | K) {
  return typeof arg === 'string' ?
      simpleReader<T, U, V>(arg) :
      arg as Reader<T, U, V>;
}

export interface PduParserOptions<T extends EmptyObject> {
  target: T,
  endian: Endian;
}


export interface PduParserStringOptions {
  lengthBits?: BitLength | 0;
  nullTerminate?: boolean;
}

export interface PduParserHexOptions {
  lengthBits?: BitLength | 0;
  length?: number;
}

export interface PduParserRepeatConditions {
  times?: number;
  minTimes?: number;
  maxTimes?: number;
}

export type PduParserRepeatSequence<V extends Dict, U extends Dict> = (parser: PduParser<V>) => PduParser<V & U> | null;

export class PduParserError extends Error {
  constructor(message: string | undefined, readonly parser: PduParser) {
    super(message);
    this.name = this.constructor.name;
  }
}

/**
 * A PDU parser with chainable read methods building an object from the merged objects
 * returned from each reader callback.
 * All read methods may either be given a property name to write the result to, or a reader callback.
 * The reader callback is called with the value read from the buffer, the current target object, and the parser itself,
 * and may return either a new result object, or the parser itself after potentially reading additional values.
 * The latter is useful for branching, e.g., reading different values depending on the contents of the previous value.
 *
 * If a sequence of read methods should be called multiple times, the repeat method may be used to chain multiple read
 * methods together which will then be repeated according to the given options or until the buffer is exhausted.
 */
export default class PduParser<V extends EmptyObject = EmptyObject> {
  private readonly buf: ByteBuffer;

  readonly endian: Endian;

  /**
   * Get the current offset in the buffer.
   */
  get offset(): number {
    return this.buf.offset;
  }

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

  private fail(message?: string): never {
    throw new PduParserError(message, this);
  }

  private parse<T, U extends ReaderResult, K extends string>(reader: Reader<T, U, V> | K, data: T): PduParser<Merge<V & ReaderValue<U>>> {
    const value = getReader(reader)(data, this.value, this);

    if (value != null && !(value instanceof PduParser)) {
      Object.assign(this.value, value);
    }

    return this as any;
  }

  private readNumber(bits: BitLength): number {
    try {
      switch (bits) {
        case 8:
          return this.buf.readUint8() ?? this.fail();
        case 16:
          return this.buf.readUint16() ?? this.fail();
        case 32:
          return this.buf.readUint32() ?? this.fail();
        default:
          this.fail('Invalid number of bits');
      }
    } catch (err) {
      this.fail(`Could not read uint${bits} at position ${this.offset}`);
    }
  }

  private readNumbers<K extends string, U extends ReaderResult, B extends BitLength>(
      bits: B,
      ...args: [Reader<Word<B>, U, V> | K] | [number, Reader<Array<Word<B>>, U, V> | K]
  ): PduParser<Merge<V & ReaderValue<U>>> {
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

  private readString(strlen?: number) {
    try {
      if (strlen) {
        return this.buf.readUTF8String(strlen, ByteBuffer.METRICS_BYTES);
      } else {
        return this.buf.readCString();
      }
    } catch (err) {
      this.fail(`Could not read string at position ${this.offset}`);
    }
  }

  /**
   * From the buffer, read a single unsigned word of the given bit length.
   * @param bits    Number of bits per number
   * @param reader  Word reader
   */
  number<U extends ReaderResult, B extends BitLength>(
      bits: B,
      reader: Reader<Word<B>, U, V>
  ): PduParser<Merge<V & ReaderValue<U>>>;

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
  number<U extends ReaderResult, B extends BitLength>(
      bits: B,
      count: number,
      reader: Reader<Array<Word<B>>, U, V>
  ): PduParser<Merge<V & ReaderValue<U>>>;

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

  number<U extends ReaderResult, K extends string, B extends BitLength>(
      bits: B,
      ...args: [Reader<Word<B>, U, V>] | [K] | [number, Reader<Array<Word<B>>, U, V>] | [number, K]
  ): PduParser<Merge<V & ReaderValue<U>>> {
    return this.readNumbers(bits, ...args);
  }

  /**
   * From the buffer, read a single unsigned byte
   * @param reader Byte reader
   */
  uint8<U extends ReaderResult>(
      reader: Reader<Word<8>, U, V>
  ): PduParser<MergeUnion<V & ReaderValue<U>>>;

  /**
   * From the buffer, read a single unsigned byte
   * @param propertyName Name of property to write value to
   */
  uint8<K extends string>(
      propertyName: K
  ): PduParser<Merge<V & Record<K, Word<8>>>>;

  /**
   * From the buffer, read "count" unsigned bytes
   * @param count  Number of bytes to read
   * @param reader Byte array reader
   */
  uint8<U extends ReaderResult>(
      count: number,
      reader: Reader<Array<Word<8>>, U, V>
  ): PduParser<MergeUnion<V & ReaderValue<U>>>;

  /**
   * From the buffer, read "count" unsigned bytes
   * @param count  Number of bytes to read
   * @param propertyName Name of property to write values to
   */
  uint8<K extends string>(
      count: number,
      propertyName: K
  ): PduParser<Merge<V & Record<K, Array<Word<8>>>>>;

  uint8<U extends ReaderResult, K extends string>(
      ...args: [Reader<Word<8>, U, V> | K] | [number, Reader<Array<Word<8>>, U, V> | K]
  ): PduParser<Merge<V & ReaderValue<U>>> {
    return this.readNumbers(8, ...args);
  }

  /**
   * From the buffer, read a single unsigned 16-bit word
   * @param reader Byte reader
   */
  uint16<U extends ReaderResult>(
      reader: Reader<Word<16>, U, V>
  ): PduParser<MergeUnion<V & ReaderValue<U>>>;

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
  uint16<U extends ReaderResult>(
      count: number,
      reader: Reader<Array<Word<16>>, U, V>
  ): PduParser<MergeUnion<V & ReaderValue<U>>>;

  /**
   * From the buffer, read "count" unsigned 16-bit words
   * @param count  Number of 16-bit words to read
   * @param propertyName Name of property to write values to
   */
  uint16<K extends string>(
      count: number,
      propertyName: K
  ): PduParser<Merge<V & {[P in K]: Array<Word<16>>}>>;

  uint16<U extends ReaderResult, K extends string>(
      ...args: [Reader<Word<16>, U, V> | K] | [number, Reader<Array<Word<16>>, U, V> | K]
  ): PduParser<Merge<V & ReaderValue<U>>> {
    return this.readNumbers(16, ...args);
  }

  /**
   * From the buffer, read a single unsigned 32-bit word
   * @param reader Byte reader
   */
  uint32<U extends ReaderResult>(
      reader: Reader<Word<32>, U, V>
  ): PduParser<MergeUnion<V & ReaderValue<U>>>;

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
  uint32<U extends ReaderResult>(
      count: number,
      reader: Reader<Array<Word<32>>, U, V>
  ): PduParser<MergeUnion<V & ReaderValue<U>>>;

  /**
   * From the buffer, read "count" unsigned 32-bit words
   * @param count  Number of 32-bit words to read
   * @param propertyName Name of property to write values to
   */
  uint32<K extends string>(
      count: number,
      propertyName: K
  ): PduParser<Merge<V & {[P in K]: Array<Word<32>>}>>;

  uint32<U extends ReaderResult, K extends string>(
      ...args: [Reader<Word<32>, U, V> | K] | [number, Reader<Array<Word<32>>, U, V> | K]
  ): PduParser<Merge<V & ReaderValue<U>>> {
    return this.readNumbers(32, ...args);
  }

  /**
   * From the buffer, read a string, optionally preceded by a length word of given bit length and parse it as UTF-8.
   * If no options are given, an uint8 length is assumed to precede the string.
   * @param reader Reader to convert string into record
   * @param options Options
   * @param [options.nullTerminate = false] Whether the string is terminated with null byte and has no length preceding it
   * @param [options.lengthBits] Number of bits in length word, defaults to 8 if nullTerminate is false, otherwise 0
   */
  string<U extends ReaderResult>(
      reader: Reader<string, U, V>,
      options?: PduParserStringOptions
  ): PduParser<MergeUnion<V & ReaderValue<U>>>;

  /**
   * From the buffer, read a string, optionally preceded by a length word of given bit length and parse it as UTF-8.
   * If no options are given, an uint8 length is assumed to precede the string.
   * @param propertyName Name of property to write value to
   * @param options Options
   * @param [options.nullTerminate = false] Whether the string is terminated with null byte and has no length preceding it
   * @param [options.lengthBits] Number of bits in length word, defaults to 8 if nullTerminate is false, otherwise 0
   */
  string<K extends string>(
      propertyName: K,
      options?: PduParserStringOptions
  ): PduParser<Merge<V & {[P in K]: string}>>;

  string<U extends ReaderResult, K extends string>(
      reader: Reader<string, U, V> | K,
      options: PduParserStringOptions = {}
  ): PduParser<Merge<V & ReaderValue<U>>> {
    const {
      nullTerminate = false,
      lengthBits = nullTerminate ? 0 : 8
    } = options;
    let str: string;

    if (lengthBits) {
      const strlen = this.readNumber(lengthBits);
      str = this.readString(strlen);
    } else if (nullTerminate) {
      str = this.readString();
    } else {
      this.fail('Cannot parse string without length or null terminator');
    }

    return this.parse(reader, str);
  }

  /**
   * From the buffer, read a length byte followed by <length> bytes.
   * Parse it as a hex string of the given length.
   * If no options are given, an uint8 length is assumed to precede the data bytes.
   * @param reader Reader to convert hex string into record, or name of property to write value to
   * @param options Options
   * @param [options.lengthBits] Number of bits in length word; 0 for no length word. Defaults to 8 if no length is given.
   * @param [options.length]     Number of bytes to read; required if no length word is present
   */
  hex<U extends ReaderResult>(
      reader: Reader<Hex, U, V>,
      options?: PduParserHexOptions
  ): PduParser<MergeUnion<V & ReaderValue<U>>>;

  /**
   * From the buffer, read a length byte followed by <length> bytes.
   * Parse it as a hex string of the given length.
   * If no options are given, an uint8 length is assumed to precede the data bytes.
   * @param propertyName Name of property to write value to
   * @param options Options
   * @param [options.lengthBits] Number of bits in length word; 0 for no length word. Defaults to 8 if no length is given.
   * @param [options.length]     Number of bytes to read; required if no length word is present
   */
  hex<K extends string>(propertyName: K, options?: PduParserHexOptions): PduParser<Merge<V & {[P in K]: Hex}>>;

  /**
   * From the buffer, read a length byte followed by <length> bytes.
   * Parse it as a hex string of the given length.
   * If no options are given, an uint8 length is assumed to precede the data bytes.
   * @param reader Reader to convert hex string into record, or name of property to write value to
   * @param options Options
   * @param [options.lengthBits] Number of bits in length word; 0 for no length word. Defaults to 8 if no length is given.
   * @param [options.length]     Number of bytes to read; required if no length word is present
   */
  hex<U extends ReaderResult, K extends string>(
      reader: Reader<Hex, U, V> | K,
      options: PduParserHexOptions = {}
  ): PduParser<Merge<V & ReaderValue<U>>> {
    const {
      length,
      lengthBits = length != null ? 0 : 8,
    } = options;
    const len = lengthBits ? this.readNumber(lengthBits) : length;

    if (len == null) {
      this.fail(`Must provide length or length bits`);
    }

    const value = len > 0 ?
        this.buf.readBytes(len).toString('hex') :
        '';

    return this.parse(reader, value);
  }

  /**
   * Repeat a sequence of read methods according to the given conditions, until the callback returns null, or until the buffer is exhausted.
   * @param conditions if true, no conditions - the sequence will be repeated forever until the callback returns null or the buffer is exhausted.
   * @param sequence A function receiving a parser object and returning that same object after performing some read operations; or null to break the sequence.
   */
  repeat<U extends Dict>(
      conditions: PduParserRepeatConditions | true,
      sequence: PduParserRepeatSequence<V, U>
  ): PduParser<Merge<V & U>> {
    if (typeof conditions !== 'object') {
      conditions = {};
    }
    const {times, minTimes, maxTimes} = conditions;
    let i = 0;

    while (true) {
      if (i === times || i === maxTimes) {
        break;
      }

      try {
        const result = sequence(this);
        i++;

        if (result === null) {
          break;
        }
      } catch (err) {
        if (times != null && i !== times) {
          this.fail(`Repeat sequence failed after ${i} iterations with condition times=${times}`);
        } else if (minTimes != null && i < minTimes) {
          this.fail(`Repeat sequence failed after ${i} iterations with condition minTimes=${minTimes}`);
        }
        break;
      }
    }
    return this as any;
  }
}