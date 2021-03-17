# pdu-codec
A codec for easily converting between JavaScript objects and binary PDUs.

## Building PDUs

Example of building a PDU from some bytes, strings, 16-bit words and hex data:

```
const pdu = new PduBuilder()
  .uint8(65, 66)
  .string('hello, ', {lengthBits: 16})
  .string('world')
  .uint16(0xCAFE)
  .string('abcde', {lengthBits: 0, nullTerminate: true})
  .hex('abcdef', {lengthBits: 32})
  .build()
```

Resulting PDU:
```
                          ┌ 8-bit length of 'world'
                          │
                          │  ┌ 'world'                     ┌ 32-bit length of hex 'abcdef'
                          │  │          ┌ 0xcafe           │
                          │  │          │                  │        ┌ hex 'abcdef'
4142 0007 68656c6c6f2c20 05 776f726c64 cafe 6162636465 00 00000003 abcdef
 │    │    │                                 │         │
 │    │    └ 'hello, '                       │         │
 │    │                                      │         └ null terminator of 'abcde'
 │    └ 16-bit length of 'hello, '           └ 'abcde'
 │
 └ uint8 [0x41, 0x42]
```

Bookmarks can be set to enable going back to fill in data:
```
const pdu = new PduBuilder()
  .uint8(65, 66)
  .string('hello, ')
  .saveMark('NAME_TO_BE_REPLACED')
  .string('world')
  .uint16(0xcafe)
  .string('whatever')
  .loadMark('NAME_TO_BE_REPLACED')
  .string('abcde')
  .end() // go back to tail of buffer
  .string('suffix')
  .build()
```

## Parsing PDUs

```
const obj = PduParser.parse('1177cafebabe056162636465')
  .uint16(word => ({word}))
  .uint8(4, bytes => ({bytes}))
  .string(foo => ({foo}))
  .value; 
```

This PDU is parsed as:

```
               ┌ length of string 'abcde'
               │
               │  ┌ string 'abcde'
               │  │
1177 cafebabe 05 6162636465
 │    │
 │    └ uint8 [0xca, 0xfe, 0xba, 0xbe]
 │
 └ uint16 0x1177
```

Each value is parsed by passing the value to a function that returns an object which is merged with the current value of the parser,
resulting in:

```
{
  word: 0x1177,
  bytes: [0xca, 0xfe, 0xba, 0xbe],
  foo: 'abcde'
}
```

For such simple mapping to property names, the property name can be passed instead of a function:

```
const obj = PduParser.parse('1177cafebabe056162636465')
  .uint16('word')
  .uint8(4, 'bytes')
  .string('foo')
  .value; 
```

For more advanced mapping, custom attributes may of course be produced:

```
const obj = PduParser.parse('666f6f2062617200002b')
  .string(s => {
     const [firstName, lastName] = s.split(' ');
     
     return {firstName, lastName};
   }, {lengthBits: 0, nullTerminate: true})
  .uint16('age')
  .value; 
```

Results in:

```
{
  firstName: 'foo',
  lastName: 'bar',
  age: 43
}
```

Note that the parser fully types the complete value as it is parsed.
Parser functions may however also return `void` if some external attribute is assigned instead:

```
let c: number;

const obj = PduParser.parse('616263')
  .uint8('a')
  .uint8('b')
  .uint8(n => {
     c = n;
   }).value; 

```

In this case, `obj` will not include the found `63` which is assigned to the external variable `c` during parsing, 
i.e., `value` will now be typed only as `{a: number; b: number}`.

