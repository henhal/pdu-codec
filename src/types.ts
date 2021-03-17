export enum Endian {
  BIG,
  LITTLE
}

export type BitLength = 8 | 16 | 32;

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export type Word<B extends BitLength> = number;

export type Hex = string;
