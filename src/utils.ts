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
  return 1 << i;
}