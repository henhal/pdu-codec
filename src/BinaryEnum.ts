import {toHex} from "./utils";

/**
 * An enum of string keys mapped to binary values.
 *
 * type Key = 'FOO' | 'BAR' | 'BAZ'
 * const e = new BinaryEnum<Key>({FOO: 0x01, BAR: 0x02, BAZ: 0x04});
 * e.encode('FOO') // returns 0x01
 * e.decodeMulti(0x05) // returns ['FOO', 'BAZ']
 */
export default class BinaryEnum<T extends string> {
  private readonly entries: Array<[T, number]>;

  /**
   * Create a new binary enum
   * @param map Map of string keys to binary values
   * @param [name] Optional name for improved error messages etc
   */
  constructor(map: Record<T, number>, readonly name = 'BinaryEnum') {
    this.entries = Object.entries(map) as Array<[T, number]>;
  }

  /**
   * Get the keys of this enum
   */
  keys(): T[] {
    return this.entries.map(([k]) => k);
  }

  /**
   * Encode an enum value into its corresponding binary value
   *
   * @param key One of the keys defined by this enum
   * @returns Binary value
   * @throws Error if the key is not part of this enum
   */
  encode(key: T): number {
    for (const [k, v] of this.entries) {
      if (k === key) return v;
    }

    throw new Error(`Invalid ${this.name} key ${key}; expected [${
      this.entries.map(([k]) => k).join(', ')}]`);
  }

  /**
   * Encode multiple enum values into an OR:ed binary value.
   *
   * @param keys One or more keys defined by this enum
   * @returns Binary value
   * @throws Error if a key is not part of this enum
   */
  encodeMulti(keys: T[]): number {
    return keys.reduce((value, key) => value | this.encode(key), 0x00);
  }

  /**
   * Decode a binary value into exactly one enum key. This is an exact match -
   * the binary value must equal the value of one of the enum keys.
   *
   * @param value Binary value
   * @returns Key value
   * @throws Error if no key corresponds to the given value
   */
  decode(value: number): T {
    for (const [k, v] of this.entries) {
      if (v === value) return k;
    }

    throw new Error(`Invalid ${this.name} value ${toHex(value)}; expected [${
      this.entries.map(([, v]) => toHex(v)).join(', ')}]`);
  }

  /**
   * Decode a binary value into multiple enum keys. The OR:ed binary values of all matched enum keys must equal
   * the given value.
   * Example: Enum (FOO=0x01, BAR=0x02, BAZ=0x08).
   * Matching 0x09 produces [FOO, BAZ].
   * Matching 0x07 will find FOO and BAR, but since there's an unmatched remainder of 0x04 it will throw an error.
   *
   * @param value Binary value
   * @returns Key values
   * @throws Error if the value could not be completely mapped to one or more keys.
   */
  decodeMulti(value: number): T[] {
    let rest = value;
    const keys = this.entries.reduce((keys, [k, v]) => {
      if ((value & v) === v) {
        keys.push(k);
        rest &= ~v;
      }
      return keys;
    }, [] as T[]);

    if (rest) {
      throw new Error(`Invalid ${this.name} value ${toHex(value)}; matched [${
        keys.join(', ')}] but unmatched remaining value ${toHex(rest)}`);
    }

    return keys;
  }
}

