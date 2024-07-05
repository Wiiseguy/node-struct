const test = require('aqa');
const { StreamBuffer } = require('streambuf');
const b = require('./index');
const { readFileSync } = require('fs');

test('read - simple', t => {
    let sb = new StreamBuffer(Buffer.alloc(1));
    sb.writeByte(255);

    t.is(b.readStruct('byte', sb.buffer), 255);
});

test('read - basic', t => {
    let struct = {
        a: 'byte',
        b: 'byte',
        c: 'sbyte'
    };
    let sb = new StreamBuffer(Buffer.alloc(3));
    sb.writeByte(1);
    sb.writeByte(255);
    sb.writeByte(255);

    let result = b.readStruct(struct, sb.buffer);

    t.deepEqual(result, {
        a: 1,
        b: 255,
        c: -1
    });
});

test('read - array type', t => {
    let struct = {
        a: ['byte', 'byte', 'uint32']
    };
    let sb = new StreamBuffer(Buffer.alloc(6));
    sb.writeByte(1);
    sb.writeByte(2);
    sb.writeUInt32LE(9000);

    let result = b.readStruct(struct, sb.buffer);

    t.deepEqual(result, {
        a: [1, 2, 9000]
    });
});

test('read - numeric types', t => {
    let struct = {
        a: 'int8',
        a1: 'sbyte',
        b: 'int16le',
        c: 'int16be',
        d: 'int32le',
        e: 'int32be',
        f: 'int64le',
        g: 'int64be',
        h: 'uint8',
        i: 'uint16le',
        j: 'uint16be',
        k: 'uint32le',
        l: 'uint32be',
        m: 'uint64le',
        n: 'uint64be',
        o: 'int16',
        p: 'int32',
        q: 'int64',
        r: 'uint16',
        s: 'uint32',
        t: 'uint64'
    };
    let sb = new StreamBuffer(Buffer.alloc(87));
    // a - g
    sb.writeUInt8(127);
    sb.writeSByte(-128);
    sb.writeInt16LE(-(2 ** 15));
    sb.writeInt16BE(-(2 ** 15));
    sb.writeInt32LE(-(2 ** 31));
    sb.writeInt32BE(-(2 ** 31));
    sb.writeBigInt64LE(-(2n ** 63n));
    sb.writeBigInt64BE(-(2n ** 63n));
    // h - n
    sb.writeByte(255);
    sb.writeUInt16LE(65535);
    sb.writeUInt16BE(65535);
    sb.writeUInt32LE(2 ** 32 - 1);
    sb.writeUInt32BE(2 ** 32 - 1);
    sb.writeBigUInt64LE(2n ** 64n - 1n);
    sb.writeBigUInt64BE(2n ** 64n - 2n);
    // o - t
    sb.writeInt16LE(-(2 ** 15));
    sb.writeInt32LE(-(2 ** 31));
    sb.writeBigInt64LE(-(2n ** 63n));
    sb.writeUInt16LE(65535);
    sb.writeUInt32LE(2 ** 32 - 1);
    sb.writeBigUInt64LE(2n ** 64n - 1n);

    let result = b.readStruct(struct, sb.buffer);

    t.deepEqual(result, {
        a: 127,
        a1: -128,
        b: -32768,
        c: -32768,
        d: -2147483648,
        e: -2147483648,
        f: -9223372036854775808n,
        g: -9223372036854775808n,
        h: 255,
        i: 65535,
        j: 65535,
        k: 4294967295,
        l: 4294967295,
        m: 18446744073709551615n,
        n: 18446744073709551614n,
        o: -32768,
        p: -2147483648,
        q: -9223372036854775808n,
        r: 65535,
        s: 4294967295,
        t: 18446744073709551615n
    });
});

test('read - string types', t => {
    let struct = {
        a: { $format: 'string' },
        b: 'string7',
        c: 'string0',
        d: 'char_3'
    };

    let sb = new StreamBuffer(Buffer.alloc(18));
    sb.writeString('hello\x00');
    sb.writeByte(5); // length of b
    sb.writeString('world');
    sb.writeString('!');
    sb.writeByte(0);
    sb.writeString('abc');

    let result = b.readStruct(struct, sb.buffer);

    t.deepEqual(result, {
        a: 'hello',
        b: 'world',
        c: '!',
        d: 'abc'
    });
});

test('read - $format - simple', t => {
    let struct = {
        a: {
            $format: 'byte'
        }
    };
    let sb = new StreamBuffer(Buffer.alloc(1));
    sb.writeByte(3);

    let result = b.readStruct(struct, sb.buffer);

    t.deepEqual(result, {
        a: 3
    });
});

test('read - $format - nested', t => {
    let struct = {
        point: {
            $format: {
                x: 'byte',
                y: 'byte'
            }
        }
    };
    let sb = new StreamBuffer(Buffer.alloc(2));
    sb.writeByte(3);
    sb.writeByte(100);

    let result = b.readStruct(struct, sb.buffer);

    t.deepEqual(result, {
        point: {
            x: 3,
            y: 100
        }
    });
});

test('read - $format - string - with length', t => {
    let struct = {
        name: {
            $format: 'string',
            $length: 3
        },
        name2: {
            $format: 'string',
            $length: 2
        }
    };
    let sb = new StreamBuffer(Buffer.alloc(8));
    sb.writeString('hello');

    let result = b.readStruct(struct, sb.buffer);

    t.deepEqual(result, {
        name: 'hel',
        name2: 'lo'
    });
});

test.skip('read - $format - string - with $map', t => {
    let struct = {
        num1: {
            $format: 'string',
            $map: 'number'
        },
        num2: {
            $format: 'string',
            $map: (...args) => args
        }
    };
    let sb = new StreamBuffer(Buffer.alloc(24));
    sb.writeString('456.8');
    sb.writeByte(0);
    sb.writeString('456.8');
    sb.writeByte(0);

    let result = b.readStruct(struct, sb.buffer);

    t.deepEqual(result, {
        num1: 456.8,
        num2: ['456.8', 'num2', result, []]
    });
});

test('read - $format - string - with length - by sibling value', t => {
    let struct = {
        name2len: { $format: 'byte', $ignore: true },
        name: {
            $format: 'string',
            $length: 3
        },
        name2: {
            $format: 'string',
            $length: 'name2len'
        }
    };
    let sb = new StreamBuffer(Buffer.alloc(12));
    sb.writeByte(4);
    sb.writeString('hello world');

    let result = b.readStruct(struct, sb.buffer);

    t.deepEqual(result, {
        name: 'hel',
        name2: 'lo w'
    });
});

test('read - $format - string - with length - sibling not found', t => {
    let struct = {
        name2len: { $format: 'byte', $ignore: true },
        name: {
            $format: 'string',
            $length: 3
        },
        name2: {
            $format: 'string',
            $length: 'name2len__bad'
        }
    };
    let sb = new StreamBuffer(Buffer.alloc(12));
    sb.writeByte(4);
    sb.writeString('hello world');

    let e = t.throws(_ => b.readStruct(struct, sb.buffer));
    t.is(e.message, "'name2len__bad' not found in scope.");
});

test('read - $format - string - no length (0 byte terminator)', t => {
    let struct = {
        str: {
            $format: 'string'
        }
    };
    let sb = new StreamBuffer(Buffer.alloc(10));
    sb.writeString('hello');
    sb.writeByte(0);
    sb.writeString('hi!');

    let result = b.readStruct(struct, sb.buffer);

    t.deepEqual(result, {
        str: 'hello'
    });
});

test('read - $format - string - encoding (utf8 default)', t => {
    let struct = {
        str: {
            $format: 'string',
            $encoding: 'utf8'
        }
    };
    let sb = new StreamBuffer(Buffer.alloc(10));
    sb.writeString('😃');
    sb.writeByte(0);

    let result = b.readStruct(struct, sb.buffer);

    t.deepEqual(result, {
        str: '😃'
    });
});

test('read - $format - string - encoding', t => {
    let struct = {
        str: {
            $format: 'string',
            $encoding: 'ascii'
        }
    };
    let sb = new StreamBuffer(Buffer.alloc(10));
    sb.writeString('😃');
    sb.writeByte(0);

    let result = b.readStruct(struct, sb.buffer);

    t.deepEqual(result, {
        str: 'p\x1F\x18\x03'
    });
});

test('read - string', t => {
    let struct = {
        str: {
            $format: 'string'
        }
    };
    let sb = new StreamBuffer(Buffer.alloc(10));
    sb.writeString('howdy');

    let result = b.readStruct(struct, sb.buffer);
    t.deepEqual(result, {
        str: 'howdy'
    });
});

test('read - string7', t => {
    let struct = {
        str: 'string7'
    };
    let sb = new StreamBuffer(Buffer.alloc(10));
    sb.writeString7('howdy');

    let result = b.readStruct(struct, sb.buffer);
    t.deepEqual(result, {
        str: 'howdy'
    });
});

test('read - $format - buffer', t => {
    let struct = {
        buf: {
            $format: 'buffer',
            $length: 4
        }
    };
    let sb = new StreamBuffer(Buffer.alloc(10));
    sb.writeString('😃');
    sb.writeByte(0);

    let result = b.readStruct(struct, sb.buffer);

    t.deepEqual(result, {
        buf: Buffer.from([0xf0, 0x9f, 0x98, 0x83])
    });
});

test('read - $format - buffer - no length', t => {
    let struct = {
        buf: {
            $format: 'buffer'
        }
    };
    let sb = new StreamBuffer(Buffer.alloc(10));
    sb.writeString('😃');
    sb.writeByte(0);

    t.throws(_ => b.readStruct(struct, sb.buffer));
});

test('read - $format - $repeat - simple', t => {
    let struct = {
        a: {
            $repeat: 3,
            $format: 'byte'
        }
    };
    let sb = new StreamBuffer(Buffer.alloc(3));
    sb.writeByte(1);
    sb.writeByte(2);
    sb.writeByte(255);

    let result = b.readStruct(struct, sb.buffer);

    t.deepEqual(result, {
        a: [1, 2, 255]
    });
});

test('read - $format - $repeat - by sibling value', t => {
    let struct = {
        num: {
            $format: 'byte'
        },
        a: {
            $repeat: 'num',
            $format: 'byte'
        }
    };
    let sb = new StreamBuffer(Buffer.alloc(4));
    sb.writeByte(3); // num
    sb.writeByte(1);
    sb.writeByte(2);
    sb.writeByte(255);

    let result = b.readStruct(struct, sb.buffer);

    t.deepEqual(result, {
        num: 3,
        a: [1, 2, 255]
    });
});

test('read - $format - $repeat - by deep sibling value', t => {
    let struct = {
        config: {
            $ignore: true,
            $format: {
                lengths: {
                    a: 'byte'
                }
            }
        },
        a: {
            $repeat: 'config.lengths.a',
            $format: 'byte'
        }
    };
    let sb = new StreamBuffer(Buffer.alloc(4));
    sb.writeByte(3); // num
    sb.writeByte(1);
    sb.writeByte(2);
    sb.writeByte(255);

    let result = b.readStruct(struct, sb.buffer);

    t.deepEqual(result, {
        a: [1, 2, 255]
    });
});

test('read - $format - $repeat - nested', t => {
    let struct = {
        shape: {
            $format: {
                numPoints: 'byte',
                points: {
                    $repeat: 'numPoints',
                    $format: {
                        x: 'byte',
                        y: 'byte',
                        location: {
                            $format: '$tell',
                            $tell: 'byte'
                        }
                    }
                }
            }
        }
    };
    let sb = new StreamBuffer(Buffer.alloc(5));
    sb.writeByte(2); // numPoints
    sb.writeByte(3);
    sb.writeByte(100);
    sb.writeByte(4);
    sb.writeByte(200);

    let result = b.readStruct(struct, sb.buffer);

    t.deepEqual(result, {
        shape: {
            numPoints: 2,
            points: [
                {
                    x: 3,
                    y: 100,
                    location: 3
                },
                {
                    x: 4,
                    y: 200,
                    location: 5
                }
            ]
        }
    });
});

test('read - $format - $foreach - simple', t => {
    let struct = {
        numbers: {
            $repeat: 3,
            $format: 'byte'
        },
        a: {
            $foreach: 'numbers n',
            $format: {
                address: {
                    $value: 'n',
                    $format: 'byte'
                },
                data: {
                    $goto: 'n',
                    $format: 'byte'
                }
            }
        }
    };
    let sb = new StreamBuffer(Buffer.alloc(3));
    sb.writeByte(2);
    sb.writeByte(1);
    sb.writeByte(0);

    let result = b.readStruct(struct, sb.buffer);

    t.deepEqual(result, {
        numbers: [2, 1, 0],
        a: [
            { address: 2, data: 0 },
            { address: 1, data: 1 },
            { address: 0, data: 2 }
        ]
    });
});

test('read - $format - $foreach - wrong list', t => {
    let struct = {
        numbers: 'byte',
        a: {
            $foreach: 'numbers n',
            $format: {}
        }
    };
    let sb = new StreamBuffer(Buffer.alloc(3));
    sb.writeByte(2);
    sb.writeByte(1);
    sb.writeByte(0);

    let e = t.throws(_ => b.readStruct(struct, sb.buffer));

    t.is(e.message, '$foreach: numbers must be an array.');
});

test('read - $format - $foreach - no alias', t => {
    let struct = {
        numbers: {
            $repeat: 3,
            $format: 'byte'
        },
        a: {
            $foreach: 'numbers',
            $format: {}
        }
    };
    let sb = new StreamBuffer(Buffer.alloc(3));
    sb.writeByte(2);
    sb.writeByte(1);
    sb.writeByte(0);

    let e = t.throws(_ => b.readStruct(struct, sb.buffer));

    t.is(e.message, `$foreach: item alias is missing, e.g. 'a' in $foreach: "numbers a"`);
});

test('read - $format - $tell', t => {
    let struct = {
        a: 'byte',
        b: {
            $format: '$tell',
            $tell: 'uint32be'
        }
    };

    let sb = new StreamBuffer(Buffer.alloc(5));
    sb.writeByte(2);
    sb.writeUInt32BE(1);

    let result = b.readStruct(struct, sb.buffer);

    t.deepEqual(result, {
        a: 2,
        b: 1
    });

    t.is(sb.tell(), 5);
});

test('read - $format - $tell - missing $tell', t => {
    let struct = {
        a: 'byte',
        b: {
            $format: '$tell'
        }
    };

    let sb = new StreamBuffer(Buffer.alloc(5));
    sb.writeByte(2);
    sb.writeUInt32BE(1);

    let e = t.throws(_ => b.readStruct(struct, sb.buffer));
    t.is(e.message, "$format: '$tell' must have a $tell property containing its type");
});

test('read - $switch - nested', t => {
    let struct = {
        numObjects: {
            $format: 'byte',
            $ignore: true
        },
        objects: {
            $repeat: 'numObjects',
            $format: {
                name: 'string7',
                dataType: 'byte',
                data: {
                    $switch: 'dataType',
                    $cases: [
                        { $case: 0, $format: { radius: 'byte' } },
                        { $case: 1, $format: ['byte', 'byte'] },
                        { $case: null, $format: 'byte' }
                    ]
                }
            }
        }
    };
    let sb = new StreamBuffer(Buffer.alloc(30));
    sb.writeByte(3); // numObjects
    // Object 1
    sb.writeString7('Ball1');
    sb.writeByte(0); // dataType 0 (data is a single byte)
    sb.writeByte(50);
    // Object 2
    sb.writeString7('Square1');
    sb.writeByte(1); // dataType 1 (data is a two bytes)
    sb.writeByte(10);
    sb.writeByte(255);
    // Object 3
    sb.writeString7('Circle1');
    sb.writeByte(2); // dataType 2 (data is a single byte - default case)
    sb.writeByte(100);

    let result = b.readStruct(struct, sb.buffer);

    t.deepEqual(result, {
        objects: [
            {
                name: 'Ball1',
                dataType: 0,
                data: {
                    radius: 50
                }
            },
            {
                name: 'Square1',
                dataType: 1,
                data: [10, 255]
            },
            {
                name: 'Circle1',
                dataType: 2,
                data: 100
            }
        ]
    });
});

test('README example', t => {
    let struct = {
        numPersons: {
            $format: 'byte',
            $ignore: true
        },
        persons: {
            $repeat: 'numPersons',
            $format: {
                firstName: 'string7',
                lastName: 'string7',
                address: {
                    city: 'string7',
                    street: 'string7',
                    number: 'uint16',
                    zipCode: 'string7'
                },
                numHobbies: {
                    $ignore: true,
                    $format: 'byte'
                },
                hobbies: {
                    $format: 'string7',
                    $repeat: 'numHobbies'
                }
            }
        }
    };

    let peopleDat = readFileSync('./examples/people.dat');
    let result = b.readStruct(struct, peopleDat);
    //let result = b.readStruct(struct, sb.buffer);

    t.deepEqual(result, {
        persons: [
            {
                firstName: 'John',
                lastName: 'A',
                address: {
                    city: 'New York',
                    street: '1st Ave.',
                    number: 1165,
                    zipCode: '10065'
                },
                hobbies: ['eating', 'coding', 'walking']
            },
            {
                firstName: 'Betty',
                lastName: 'B',
                address: {
                    city: 'York',
                    street: 'Bridge St.',
                    number: 1,
                    zipCode: 'YO1 6DD'
                },
                hobbies: []
            }
        ]
    });
});

test('read - $goto - basic', t => {
    let struct = {
        a: {
            $goto: 3,
            $format: 'byte'
        },
        b: {
            $goto: 2,
            $format: 'byte'
        },
        c: {
            $goto: 1,
            $format: 'byte'
        },
        d: {
            $goto: 0,
            $format: 'byte'
        }
    };
    let sb = new StreamBuffer(Buffer.alloc(4));
    sb.writeByte(1);
    sb.writeByte(2);
    sb.writeByte(3);
    sb.writeByte(4);

    let result = b.readStruct(struct, sb.buffer);

    t.deepEqual(result, {
        a: 4,
        b: 3,
        c: 2,
        d: 1
    });
});

test('read - $goto - by sibling value', t => {
    let struct = {
        a: {
            $goto: 3,
            $format: 'byte'
        },
        b: {
            $goto: 'a',
            $format: 'byte'
        },
        c: {
            $goto: 'b',
            $format: 'byte'
        },
        d: {
            $goto: 'c',
            $format: 'byte'
        }
    };
    let sb = new StreamBuffer(Buffer.alloc(4));
    sb.writeByte(1);
    sb.writeByte(2);
    sb.writeByte(3);
    sb.writeByte(0);

    let result = b.readStruct(struct, sb.buffer);

    t.deepEqual(result, {
        a: 0,
        b: 1,
        c: 2,
        d: 3
    });
});

test('read - $skip - basic', t => {
    let struct = {
        a: 'byte',
        b: {
            $skip: 1,
            $format: 'byte'
        }
    };
    let sb = new StreamBuffer(Buffer.alloc(3));
    sb.writeByte(1);
    sb.writeByte(2);
    sb.writeByte(3);

    let result = b.readStruct(struct, sb.buffer);

    t.deepEqual(result, {
        a: 1,
        b: 3
    });
});

test('read - $skip - by sibling value', t => {
    let struct = {
        a: 'byte',
        b: {
            $skip: 'a',
            $format: 'byte'
        }
    };
    let sb = new StreamBuffer(Buffer.alloc(3));
    sb.writeByte(1);
    sb.writeByte(2);
    sb.writeByte(3);

    let result = b.readStruct(struct, sb.buffer);

    t.deepEqual(result, {
        a: 1,
        b: 3
    });
});

test('read - big ints', t => {
    let struct = {
        a: 'uint64',
        b: {
            $goto: 0,
            $format: 'int64'
        }
    };
    let sb = new StreamBuffer(Buffer.alloc(8));
    sb.writeUInt32LE(0xffffffff);
    sb.writeUInt32LE(0xffffffff);
    let result = b.readStruct(struct, sb.buffer);

    t.deepEqual(result, {
        a: 18446744073709551615n,
        b: -1n
    });
});

test('read - $format - $value', t => {
    let struct = {
        name: {
            $format: 'string'
        },
        name2: {
            $value: 'name',
            $format: 'string'
        }
    };
    let sb = new StreamBuffer(Buffer.alloc(8));
    sb.writeString('hello');
    sb.writeByte(0);

    let result = b.readStruct(struct, sb.buffer);

    t.deepEqual(result, {
        name: 'hello',
        name2: 'hello'
    });
});

test('read - $format - $value - without $format', t => {
    let struct = {
        name: {
            $value: 'a'
        }
    };

    let sb = new StreamBuffer(Buffer.alloc(8));
    sb.writeString('hello');
    sb.writeByte(0);

    let e = t.throws(_ => b.readStruct(struct, sb.buffer));
    t.is(e.message, '$value must be used with $format');
});

test('read - unknown def type', t => {
    let struct = {
        a: 'guid'
    };

    let result = Buffer.alloc(1);
    let e = t.throws(_ => b.readStruct(struct, result));

    t.is(e.message, "Unknown struct type: 'guid' for 'a'");
});

test('read - string as def type', t => {
    let struct = {
        a: 'string'
    };

    let result = Buffer.alloc(1);
    let e = t.throws(_ => b.readStruct(struct, result));

    t.is(e.message, 'string may only be used as a $format');
});

test('read - buffer as def type', t => {
    let struct = {
        a: 'buffer'
    };

    let result = Buffer.alloc(1);
    let e = t.throws(_ => b.readStruct(struct, result));

    t.is(e.message, 'buffer may only be used as a $format');
});

// Write

test('write - simple', t => {
    let struct = {
        a: 'byte',
        b: 'byte',
        c: 'sbyte'
    };

    let obj = {
        a: 1,
        b: 255,
        c: -1
    };

    let result = Buffer.alloc(3);
    b.writeStruct(obj, struct, result);

    let expected = new StreamBuffer(Buffer.alloc(3));
    expected.writeByte(1);
    expected.writeByte(255);
    expected.writeByte(255);

    t.deepEqual(result, expected.buffer);
});

test('write - array type', t => {
    let struct = {
        a: ['byte', 'byte', 'uint32']
    };

    let obj = {
        a: [1, 2, 9000]
    };

    let result = Buffer.alloc(6);
    b.writeStruct(obj, struct, result);

    let expected = new StreamBuffer(Buffer.alloc(6));
    expected.writeByte(1);
    expected.writeByte(2);
    expected.writeUInt32LE(9000);

    t.deepEqual(result, expected.buffer);
});

test('write - numeric types', t => {
    let struct = {
        a: 'int8',
        a1: 'sbyte',
        b: 'int16le',
        c: 'int16be',
        d: 'int32le',
        e: 'int32be',
        f: 'int64le',
        g: 'int64be',
        h: 'uint8',
        i: 'uint16le',
        j: 'uint16be',
        k: 'uint32le',
        l: 'uint32be',
        m: 'uint64le',
        n: 'uint64be',
        o: 'int16',
        p: 'int32',
        q: 'int64',
        r: 'uint16',
        s: 'uint32',
        t: 'uint64'
    };

    let obj = {
        a: 127,
        a1: -128,
        b: -32768,
        c: -32768,
        d: -2147483648,
        e: -2147483648,
        f: -9223372036854775808n,
        g: -9223372036854775808n,
        h: 255,
        i: 65535,
        j: 65535,
        k: 4294967295,
        l: 4294967295,
        m: 18446744073709551615n,
        n: 18446744073709551614n,
        o: -32768,
        p: -2147483648,
        q: -9223372036854775808n,
        r: 65535,
        s: 4294967295,
        t: 18446744073709551615n
    };

    let result = Buffer.alloc(87);
    b.writeStruct(obj, struct, result);

    let expected = new StreamBuffer(Buffer.alloc(87));
    // a - g
    expected.writeUInt8(127);
    expected.writeSByte(-128);
    expected.writeInt16LE(-32768);
    expected.writeInt16BE(-32768);
    expected.writeInt32LE(-2147483648);
    expected.writeInt32BE(-2147483648);
    expected.writeBigInt64LE(-9223372036854775808n);
    expected.writeBigInt64BE(-9223372036854775808n);
    // h - n
    expected.writeByte(255);
    expected.writeUInt16LE(65535);
    expected.writeUInt16BE(65535);
    expected.writeUInt32LE(4294967295);
    expected.writeUInt32BE(4294967295);
    expected.writeBigUInt64LE(18446744073709551615n);
    expected.writeBigUInt64BE(18446744073709551614n);
    // o - t
    expected.writeInt16LE(-32768);
    expected.writeInt32LE(-2147483648);
    expected.writeBigInt64LE(-9223372036854775808n);
    expected.writeUInt16LE(65535);
    expected.writeUInt32LE(4294967295);
    expected.writeBigUInt64LE(18446744073709551615n);

    t.deepEqual(result, expected.buffer);
});

test('write - object', t => {
    let struct = {
        a: {
            age: 'uint32',
            name: 'string0',
            name7: 'string7'
        },
        b: {
            age: 'uint32',
            name: 'string0',
            name7: 'string7'
        }
    };

    let obj = {
        a: { age: 30, name: 'Aaa', name7: 'Eee' },
        b: { age: 35, name: 'Bbb', name7: 'Fff' }
    };

    let result = Buffer.alloc(24);
    b.writeStruct(obj, struct, result);

    let expected = new StreamBuffer(Buffer.alloc(24));
    expected.writeUInt32LE(30);
    expected.writeString('Aaa');
    expected.writeByte(0);
    expected.writeString7('Eee');
    expected.writeUInt32LE(35);
    expected.writeString('Bbb');
    expected.writeByte(0);
    expected.writeString7('Fff');

    t.deepEqual(result, expected.buffer);
});

test('write - object - null', t => {
    let struct = {
        a: {
            name: 'string0'
        }
    };

    let obj = {
        a: null
    };

    let result = Buffer.alloc(1);
    let e = t.throws(_ => b.writeStruct(obj, struct, result));
    t.is(e.message, "_write: Can not read properties from missing 'a'");
});

test('write - bad $format', t => {
    let struct = {
        a: {
            $format: 1
        }
    };

    let obj = {
        a: 1
    };

    let result = Buffer.alloc(1);
    let e = t.throws(_ => b.writeStruct(obj, struct, result));
    t.is(e.message, '_write: Unknown def type: 1 (number)');
});

test('write - $switch', t => {
    let struct = {
        a: {
            $switch: 'type',
            $cases: [
                { $case: null, $format: 'uint16be' },
                { $case: 0, $format: 'byte' },
                { $case: 1, $format: 'uint16' }
            ]
        }
    };

    let obj = {
        type: 0,
        a: 255
    };

    let result = Buffer.alloc(3);
    b.writeStruct(obj, struct, result);

    let expected = new StreamBuffer(Buffer.alloc(3));
    expected.writeByte(255);

    t.deepEqual(result, expected.buffer);

    // type 1
    obj.type = 1;
    obj.a = 65535;
    result = Buffer.alloc(3);
    b.writeStruct(obj, struct, result);

    expected = new StreamBuffer(Buffer.alloc(3));
    expected.writeUInt16LE(65535);

    t.deepEqual(result, expected.buffer);

    // test default
    obj.type = 2;
    obj.a = 65535;
    result = Buffer.alloc(3);
    b.writeStruct(obj, struct, result);

    expected = new StreamBuffer(Buffer.alloc(3));
    expected.writeUInt16BE(65535);

    t.deepEqual(result, expected.buffer);
});

test('write - $format - $value', t => {
    let struct = {
        a: 'byte',
        b: {
            $value: 'a',
            $format: 'byte'
        }
    };

    let obj = {
        a: 255,
        b: 1
    };

    let result = Buffer.alloc(2);
    b.writeStruct(obj, struct, result);

    let expected = new StreamBuffer(Buffer.alloc(2));
    expected.writeByte(255);
    expected.writeByte(255);

    t.deepEqual(result, expected.buffer);
});

test('write - $value - without $format', t => {
    let struct = {
        a: {
            $value: 'b'
        }
    };

    let obj = {
        a: 1
    };

    let result = Buffer.alloc(1);
    let e = t.throws(_ => b.writeStruct(obj, struct, result));

    t.is(e.message, '_write: $value must be used with $format');
});

test('write - $format - $tell', t => {
    let struct = {
        a: 'byte',
        b: {
            $format: '$tell',
            $tell: 'uint32be'
        }
    };

    let obj = {
        a: 2,
        b: 0
    };

    let result = Buffer.alloc(5);
    b.writeStruct(obj, struct, result);

    let expected = new StreamBuffer(Buffer.alloc(5));
    expected.writeByte(2);
    expected.writeUInt32BE(1);

    t.is(expected.tell(), result.length);

    t.deepEqual(result, expected.buffer);
});

test('write - $format - $tell - missing $tell', t => {
    let struct = {
        a: 'byte',
        b: {
            $format: '$tell'
        }
    };

    let obj = {
        a: 2,
        b: 0
    };

    let result = Buffer.alloc(5);
    let e = t.throws(_ => b.writeStruct(obj, struct, result));
    t.is(e.message, "_write: $format: '$tell' must have a $tell property containing its type (b)");
});

test('write - char_x', t => {
    let struct = {
        a: {
            name: 'char_3'
        },
        b: {
            name: 'char_3'
        },
        c: {
            name: 'char_3'
        },
        d: {
            name: 'char_3'
        },
        e: {
            name: 'char_3'
        },
        f: {
            name: 'char_3'
        }
    };

    let obj = {
        a: { name: 'Abcdefgh' },
        b: { name: 'B' },
        c: { name: 'Cde' },
        d: { name: '' },
        e: {},
        f: { name: 'Ab' }
    };

    let result = Buffer.alloc(19);
    b.writeStruct(obj, struct, result);

    let expected = new StreamBuffer(Buffer.alloc(result.length));
    expected.writeString('Abc');
    expected.writeString('B\x00\x00');
    expected.writeString('Cde');
    expected.writeString('\x00\x00\x00');
    expected.writeString('\x00\x00\x00');
    expected.writeString('Ab\x00');

    t.deepEqual(result, expected.buffer);
});

test('write - string types', t => {
    let struct = {
        a: {
            $format: 'string',
            $length: 5
        },
        b: 'string7',
        c: 'string0'
    };

    let obj = {
        a: 'hello',
        b: 'world',
        c: '!'
    };

    let result = Buffer.alloc(15);
    b.writeStruct(obj, struct, result);

    let expected = new StreamBuffer(Buffer.alloc(15));
    expected.writeString('hello');
    expected.writeByte(5);
    expected.writeString('world');
    expected.writeString('!');
    expected.writeByte(0);

    t.deepEqual(result, expected.buffer);
});

test('write - string types - bad value', t => {
    let struct = {
        a: { $format: 'string', $length: 3 },
        b: 'string7',
        c: 'string0',
        d: 'char_3'
    };

    let obj1 = {
        a: 1,
        b: 2,
        c: 3
    };

    let result = Buffer.alloc(15);
    let e = t.throws(_ => b.writeStruct(obj1, struct, result));
    t.is(e.message, '_write: string: 1 is not a string (a)');

    let obj2 = {
        a: 'hello',
        b: 2,
        c: 3
    };

    e = t.throws(_ => b.writeStruct(obj2, struct, result));
    t.is(e.message, '_write: string: 2 is not a string (b)');

    let obj3 = {
        a: 'hello',
        b: 'world',
        c: 3
    };

    e = t.throws(_ => b.writeStruct(obj3, struct, result));
    t.is(e.message, '_write: string: 3 is not a string (c)');

    let obj4 = {
        a: 'hello',
        b: 'world',
        c: '!',
        d: 4
    };

    e = t.throws(_ => b.writeStruct(obj4, struct, result));
    t.is(e.message, '_write: char_x: 4 is not a string (d)');
});

test('write - $format - $repeat - simple', t => {
    let struct = {
        a: {
            $repeat: 3,
            $format: 'byte'
        }
    };

    let obj = {
        a: [1, 2, 255]
    };

    let result = Buffer.alloc(3);
    b.writeStruct(obj, struct, result);

    let expected = new StreamBuffer(Buffer.alloc(3));
    expected.writeByte(1);
    expected.writeByte(2);
    expected.writeByte(255);

    t.deepEqual(result, expected.buffer);
});

test('write - $format - $repeat - by sibling value', t => {
    let struct = {
        num: 'byte',
        a: {
            $repeat: 'num',
            $format: 'byte'
        }
    };

    let obj = {
        num: 3,
        a: [1, 2, 255]
    };

    let result = Buffer.alloc(4);
    b.writeStruct(obj, struct, result);

    let expected = new StreamBuffer(Buffer.alloc(4));
    expected.writeByte(3);
    expected.writeByte(1);
    expected.writeByte(2);
    expected.writeByte(255);

    t.deepEqual(result, expected.buffer);
});

test('write - $format - $repeat - by deep sibling value', t => {
    let struct = {
        config: {
            $ignore: true,
            $format: {
                lengths: {
                    a: 'byte'
                }
            }
        },
        a: {
            $repeat: 'config.lengths.a',
            $format: 'byte'
        }
    };

    let obj = {
        config: {
            lengths: {
                a: 3
            }
        },
        a: [1, 2, 255]
    };

    let result = Buffer.alloc(4);
    b.writeStruct(obj, struct, result);

    let expected = new StreamBuffer(Buffer.alloc(4));
    expected.writeByte(3);
    expected.writeByte(1);
    expected.writeByte(2);
    expected.writeByte(255);

    t.deepEqual(result, expected.buffer);
});

test('write - $format - $foreach - simple', t => {
    let struct = {
        numbers: {
            $repeat: 3,
            $format: 'byte'
        },
        a: {
            $foreach: 'numbers n',
            $format: {
                address: {
                    $goto: 'n',
                    $format: 'byte',
                    $value: 'n'
                }
            }
        }
    };

    let obj = {
        numbers: [3, 4, 5],
        a: [{ address: 3 }, { address: 4 }, { address: 5 }]
    };

    let result = Buffer.alloc(6);
    b.writeStruct(obj, struct, result);

    let expected = new StreamBuffer(Buffer.alloc(6));
    expected.writeByte(3);
    expected.writeByte(4);
    expected.writeByte(5);
    expected.writeByte(3);
    expected.writeByte(4);
    expected.writeByte(5);

    t.is(expected.tell(), result.length);

    t.deepEqual(result, expected.buffer);
});

test('write - $format - $foreach - simple 2', t => {
    let struct = {
        numbers: {
            $repeat: 7,
            $format: 'byte'
        },
        a: {
            $foreach: 'numbers n',
            $format: {
                name: {
                    $format: 'string',
                    $length: 'n'
                }
            }
        }
    };

    let obj = {
        numbers: [3, 4, 5, 4, 3, 2, 1],
        a: [
            { name: 'abc' },
            { name: 'defg' },
            { name: 'hijkl' },
            { name: 'xyz' },
            { name: 'xyz' },
            { name: 'xyz' },
            { name: 'xyz' }
        ]
    };

    let result = Buffer.alloc(30);
    b.writeStruct(obj, struct, result);

    let expected = new StreamBuffer(Buffer.alloc(30));
    expected.writeByte(3);
    expected.writeByte(4);
    expected.writeByte(5);
    expected.writeByte(4);
    expected.writeByte(3);
    expected.writeByte(2);
    expected.writeByte(1);
    expected.writeString('abc');
    expected.writeString('defg');
    expected.writeString('hijkl');
    expected.writeString('xyz\x00');
    expected.writeString('xyz');
    expected.writeString('xy');
    expected.writeString('x');

    t.deepEqual(result, expected.buffer);
});

test('write - $format - $foreach - wrong syntax', t => {
    let struct = {
        numbers: ['byte', 'byte'],
        a: {
            $foreach: 'numbers',
            $format: {}
        }
    };

    let obj = {
        numbers: [1, 2],
        a: [{}, {}]
    };

    let result = Buffer.alloc(4);
    let e = t.throws(_ => b.writeStruct(obj, struct, result));
    t.is(e.message, `$foreach: item alias is missing, e.g. 'a' in $foreach: "numbers a"`);
});

test('write - $format - $foreach - target is not an array', t => {
    let struct = {
        numbers: 'byte',
        a: {
            $foreach: 'numbers n',
            $format: {}
        }
    };

    let obj = {
        numbers: 2,
        a: {}
    };

    let result = Buffer.alloc(3);
    let e = t.throws(_ => b.writeStruct(obj, struct, result));
    t.is(e.message, '$foreach: numbers must be an array.');
});

test('write - $format - string with length', t => {
    let struct = {
        name: {
            $format: 'string',
            $length: 3
        }
    };

    let obj1 = {
        name: 'hello'
    };

    let result1 = Buffer.alloc(8);
    result1.fill(0xff);
    b.writeStruct(obj1, struct, result1);

    let expectedBuffer = Buffer.alloc(8);
    expectedBuffer.fill(0xff);
    expectedBuffer.write('hel', 0);

    t.deepEqual(result1, expectedBuffer);

    let obj2 = {
        name: 'hi'
    };

    let result2 = Buffer.alloc(8);
    result2.fill(0xff);
    b.writeStruct(obj2, struct, result2);

    let expectedBuffer2 = Buffer.alloc(8);
    expectedBuffer2.fill(0xff);
    expectedBuffer2.write('hi\x00', 0);

    t.deepEqual(result2, expectedBuffer2);

    let obj3 = {
        // no name property
    };

    let result3 = Buffer.alloc(8);
    result3.fill(0xff);
    b.writeStruct(obj3, struct, result3);

    let expectedBuffer3 = Buffer.alloc(8);
    expectedBuffer3.fill(0xff);
    expectedBuffer3.write('\x00\x00\x00', 0);

    t.deepEqual(result3, expectedBuffer3);

    let obj4 = {
        name: 123 // not a string
    };

    let result4 = Buffer.alloc(8);
    result4.fill(0xff);

    let e = t.throws(_ => b.writeStruct(obj4, struct, result4));
    t.is(e.message, '_write: string: 123 is not a string (name)');
});

test('write - $format - string without length', t => {
    let struct = {
        name: {
            $format: 'string'
        }
    };

    let obj1 = {
        name: 'hello'
    };

    let result = Buffer.alloc(8);
    result.fill(0xff);
    let e = t.throws(_ => b.writeStruct(obj1, struct, result));
    t.is(e.message, "_write: when $format = 'string', $length must be an integer greater than 0.");
});

test('write - $format - buffer', t => {
    let struct = {
        a: 'byte',
        buf: {
            $format: 'buffer',
            $length: 4
        }
    };

    let obj = {
        a: 1,
        buf: Buffer.from([0x02, 0x03, 0x04, 0x05])
    };

    let result = Buffer.alloc(5);
    b.writeStruct(obj, struct, result);

    let expected = Buffer.from([1, 0x02, 0x03, 0x04, 0x05]);

    t.deepEqual(result, expected);
});

test('write - $format - buffer without length', t => {
    let struct = {
        a: {
            $format: 'byte'
        },
        buf: {
            $format: 'buffer'
        }
    };

    let obj = {
        a: 1,
        buf: Buffer.from([0x02, 0x03, 0x04, 0x05])
    };

    let result = Buffer.alloc(5);
    let e = t.throws(_ => b.writeStruct(obj, struct, result));
    t.is(e.message, `_write: when $format = 'buffer', $length must be an integer greater than 0.`);
});

test('write - string as def type', t => {
    let struct = {
        a: 'string'
    };

    let obj = {
        a: 'hello'
    };

    let result = Buffer.alloc(5);
    let e = t.throws(_ => b.writeStruct(obj, struct, result));
    t.is(e.message, '_write: string may only be used as a $format');
});

test('write - buffer as def type', t => {
    let struct = {
        a: 'buffer'
    };

    let obj = {
        a: Buffer.from([0x01, 0x02, 0x03])
    };

    let result = Buffer.alloc(3);
    let e = t.throws(_ => b.writeStruct(obj, struct, result));
    t.is(e.message, '_write: buffer may only be used as a $format');
});

test('write - $goto - basic', t => {
    let struct = {
        a: {
            $goto: 3,
            $format: 'byte'
        },
        b: {
            $goto: 2,
            $format: 'byte'
        },
        c: {
            $goto: 1,
            $format: 'byte'
        },
        d: {
            $goto: 0,
            $format: 'byte'
        }
    };

    let obj = {
        a: 4,
        b: 3,
        c: 2,
        d: 1
    };

    let result = Buffer.alloc(4);
    b.writeStruct(obj, struct, result);

    let expected = Buffer.from([1, 2, 3, 4]);

    t.deepEqual(result, expected);
});

test('write - $skip - basic', t => {
    let struct = {
        a: 'byte',
        b: {
            $skip: 1,
            $format: 'byte'
        }
    };

    let obj = {
        a: 1,
        b: 3
    };

    let result = Buffer.alloc(3);
    b.writeStruct(obj, struct, result);

    let expected = Buffer.from([1, 0, 3]);

    t.deepEqual(result, expected);
});

test('write - unknown def type', t => {
    let struct = {
        a: 'guid'
    };

    let obj = {
        a: 1
    };

    let result = Buffer.alloc(1);
    let e = t.throws(_ => b.writeStruct(obj, struct, result));
    t.is(e.message, "Unknown struct type: 'guid' for 'a'");
});

// sizeOf

test('sizeOf - simple', t => {
    let struct = {
        a: 'byte',
        b: 'byte',
        c: 'sbyte'
    };

    let result = b.sizeOf(struct);

    t.is(result, 3);
});

test('sizeOf - nested', t => {
    let struct = {
        a: {
            age: 'uint32',
            name: 'char_8'
        },
        b: {
            age: 'uint32',
            name: 'char_8'
        },
        c: {
            $repeat: 2,
            $format: {
                age: 'uint32',
                name: 'char_8'
            }
        }
    };

    let result = b.sizeOf(struct);

    t.is(result, 48);
});
