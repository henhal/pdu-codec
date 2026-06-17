import { Hex } from './types';

const HEX_BYTES_PATTERN = /[0-9a-fA-F]*/;

export function parseHex(hex: string): Buffer {
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const [match] = HEX_BYTES_PATTERN.exec(hex)!; // assertion due to regexp that always matches

  if (match !== hex) {
    const pos = Math.floor(match.length / 2);

    throw new Error(`Invalid hex data at byte ${pos}: '${hex.substring(pos * 2, (pos + 1) * 2)}'`);
  }

  if (hex.length % 2) {
    throw new Error(`Invalid hex data; length must be even`);
  }

  return Buffer.from(hex, 'hex');
}

export function toHex(n: number): string {
  const s = n.toString(16);

  return (s.length % 2) ? `0${s}` : s;
}

export function bit(i: number): number {
  return Math.pow(2, i);
}

/**
 * Convenience function to convert a hex string to an object with a named Buffer property
 * @param propertyName Name of the Buffer property
 */
export function asBuffer<K extends string>(
    propertyName: K
): (hex: Hex) => {[P in K]: Buffer} {
  return hex => ({
    [propertyName]: Buffer.from(hex, 'hex')
  } as {[P in K]: Buffer});
}