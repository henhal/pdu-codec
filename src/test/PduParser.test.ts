import {Endian} from '../types';
import PduParser from '../PduParser';

describe('PduParser tests', () => {
  it('should decode uint8', () => {
    expect(PduParser.parse('41').uint8(x => ({x})).value).toEqual({x: 65});
    expect(PduParser.parse('4142').uint8(2, x => ({x})).value).toEqual({x: [65, 66]});
  });
  it('should decode uint16', () => {
    expect(PduParser.parse('0041').uint16(x => ({x})).value).toEqual({x: 65});
    expect(PduParser.parse('00410042').uint16(2, x => ({x})).value).toEqual({x: [65, 66]});

    expect(PduParser.parse('41004200', {endian: Endian.LITTLE})
        .uint16(2, x => ({x})).value)
        .toEqual({x: [65, 66]});
  });
  it('should decode uint32', () => {
    expect(PduParser.parse('00000041')
        .uint32(x => ({x})).value)
        .toEqual({x: 65});
    expect(PduParser.parse('0000004100000042')
        .uint32(2, x => ({x})).value)
        .toEqual({x: [65, 66]});

    expect(PduParser.parse('4100000042000000', {endian: Endian.LITTLE})
        .uint32(2, x => ({x})).value)
        .toEqual({x: [65, 66]});
  });
  it('should decode string with length', () => {
    expect(PduParser.parse('06616263646566').string('x').value)
        .toEqual({x: 'abcdef'});
    expect(PduParser.parse('0006616263646566').string('x', {lengthBits: 16}).value)
        .toEqual({x: 'abcdef'});

    expect(PduParser.parse('06c3a5c3a4c3b6').string('x').value)
        .toEqual({x: 'åäö'});
  });

  it('should decode null terminated string', () => {
    expect(PduParser.parse('61626364656600')
        .string('x', {nullTerminate: true, lengthBits: 0})
        .value)
        .toEqual({x: 'abcdef'});
  });


  it('should decode hex', () => {
    expect(PduParser.parse('03abcdef').hex('x').value)
        .toEqual({x: 'abcdef'});
    expect(PduParser.parse('0003abcdef').hex('x', {lengthBits: 16}).value)
        .toEqual({x:'abcdef'});
    expect(PduParser.parse('abcdef').hex('x', {length: 3, lengthBits: 0}).value)
        .toEqual({x: 'abcdef'});
  });

  it('should decode mixed data', () => {
    expect(PduParser.parse('41420768656c6c6f2c20776f726c6400cafe00000003abcdef')
        .uint8(2, 'bytes')
        .string('greeting')
        .string('name', {lengthBits: 0, nullTerminate: true})
        .uint16('cafe')
        .hex('hex', {lengthBits: 32})
        .value)
        .toEqual({
          bytes: [65, 66],
          greeting: 'hello, ',
          name: 'world',
          cafe: 0xcafe,
          hex: 'abcdef'
        });
  });
});