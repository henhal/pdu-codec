import PduBuilder from '../PduBuilder';
import {Endian} from '../types';

describe('PduBuilder tests', () => {
  it('should encode uint8', () => {
    expect(new PduBuilder().uint8(65).build()).toEqual('41');
    expect(new PduBuilder().uint8(65, 66).build()).toEqual('4142');
  });
  it('should encode uint16', () => {
    expect(new PduBuilder().uint16(65).build()).toEqual('0041');
    expect(new PduBuilder().uint16(65, 66).build()).toEqual('00410042');

    expect(new PduBuilder({endian: Endian.LITTLE}).uint16(65, 66).build())
        .toEqual('41004200');
  });
  it('should encode uint32', () => {
    expect(new PduBuilder().uint32(65).build()).toEqual('00000041');
    expect(new PduBuilder().uint32(65, 66).build()).toEqual('0000004100000042');

    expect(new PduBuilder({endian: Endian.LITTLE}).uint32(65, 66).build())
        .toEqual('4100000042000000');
  });

  it('should encode string with length', () => {
    expect(new PduBuilder().string('abcdef').build())
        .toEqual('06616263646566');
    expect(new PduBuilder().string('abcdef', {lengthBits: 16}).build())
        .toEqual('0006616263646566');

    expect(new PduBuilder().string('åäö').build())
        .toEqual('06c3a5c3a4c3b6');
  });

  it('should encode null terminated string', () => {
    expect(new PduBuilder()
        .string('abcdef', {nullTerminate: true, lengthBits: 0})
        .build())
        .toEqual('61626364656600');
  });

  it('should encode string with min/max length', () => {
    expect(new PduBuilder()
        .string('åäö', {minLength: 6, maxLength: 6})
        .build())
        .toEqual('06c3a5c3a4c3b6');

    expect(() => new PduBuilder()
        .string('åäö', {maxLength: 5})
        .build())
        .toThrow('0..5');

    expect(() => new PduBuilder()
        .string('åäö', {minLength: 7})
        .build())
        .toThrow('7..255');
    expect(() => new PduBuilder()
        .string('åäö', {lengthBits: 16, minLength: 7})
        .build())
        .toThrow('7..65535');
  });

  it('should encode hex', () => {
    expect(new PduBuilder().hex('abcdef').build())
        .toEqual('03abcdef');
    expect(new PduBuilder().hex('abcdef', {lengthBits: 16}).build())
        .toEqual('0003abcdef');
  });

  it('should encode hex with min/max length', () => {
    expect(new PduBuilder()
        .hex('abcdef', {minLength: 3, maxLength: 3})
        .build())
        .toEqual('03abcdef');

    expect(() => new PduBuilder()
        .hex('abcdef', {maxLength: 2})
        .build())
        .toThrow('0..2');

    expect(() => new PduBuilder()
        .hex('abcdef', {minLength: 4})
        .build())
        .toThrow('4..255');
    expect(() => new PduBuilder()
        .hex('abcdef', {lengthBits: 16, minLength: 4})
        .build())
        .toThrow('4..65535');
  });

  it('should encode mixed data', () => {
    expect(new PduBuilder()
        .uint8(65, 66)
        .string('hello, ')
        .string('world', {lengthBits: 0, nullTerminate: true})
        .uint16(0xcafe)
        .hex('abcdef', {lengthBits: 32})
        .build())
        .toEqual('41420768656c6c6f2c20776f726c6400cafe00000003abcdef');
  });

  it('should support bookmarks', () => {
    expect(new PduBuilder()
        .uint8(65, 66)
        .string('hello, ')
        .saveMark('NAME')
        .string('world', {lengthBits: 0, nullTerminate: true})
        .uint16(0xcafe)
        .loadMark('NAME')
        .string('abcde', {lengthBits: 0, nullTerminate: true})
        .end()
        .hex('abcdef', {lengthBits: 32})
        .build())
        .toEqual('41420768656c6c6f2c20616263646500cafe00000003abcdef');
  });

});