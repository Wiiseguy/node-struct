const test = require('aqa');
const StreamBuffer = require('streambuf')
const b = require('./index')
const fs = require('fs');

test('Simple', t => {
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
    })
});


test('Array type', t => {
    let struct = {
        a: ['byte', 'byte', 'uint32'],
    };
    let sb = new StreamBuffer(Buffer.alloc(6));
    sb.writeByte(1);
    sb.writeByte(2);
    sb.writeUInt32LE(9000);
    
    let result = b.readStruct(struct, sb.buffer);

    t.deepEqual(result, {
        a: [1, 2, 9000],
    })
});

test('$format - simple', t => {
    let struct = {
        a: {
            $format: 'byte',
        },
    };
    let sb = new StreamBuffer(Buffer.alloc(1));
    sb.writeByte(3);
    
    let result = b.readStruct(struct, sb.buffer);

    t.deepEqual(result, {
        a: 3
    })
});

test('$format - nested', t => {
    let struct = {
        point: {
            $format: {
                x: 'byte',
                y: 'byte'
            },
        },
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
    })
});

test('$format - string - with length', t => {
    let struct = {
        name: {
            $format: 'string',
            $length: 3
        },
        name2: {
            $format: 'string',
            $length: 2
        },
    };
    let sb = new StreamBuffer(Buffer.alloc(8));
    sb.writeString("hello");

    let result = b.readStruct(struct, sb.buffer);

    t.deepEqual(result, {
        name: 'hel',
        name2: 'lo'
    })
});

test('$format - string - no length (0 byte terminator)', t => {
    let struct = {
        str: {
            $format: 'string'
        },
    };
    let sb = new StreamBuffer(Buffer.alloc(10));
    sb.writeString("hello");
    sb.writeByte(0);
    sb.writeString("hi!");

    let result = b.readStruct(struct, sb.buffer);

    t.deepEqual(result, {
        str: 'hello'
    })
});

test('$format - string - encoding (utf8 default)', t => {
    let struct = {
        str: {
            $format: 'string',
            $encoding: 'utf8'
        },
    };
    let sb = new StreamBuffer(Buffer.alloc(10));
    sb.writeString('😃');
    sb.writeByte(0);

    let result = b.readStruct(struct, sb.buffer);

    t.deepEqual(result, {
        str: '😃'
    })
});

test('$format - string - encoding', t => {
    let struct = {
        str: {
            $format: 'string',
            $encoding: 'ascii'
        },
    };
    let sb = new StreamBuffer(Buffer.alloc(10));
    sb.writeString('😃');
    sb.writeByte(0);

    let result = b.readStruct(struct, sb.buffer);

    t.deepEqual(result, {
        str: 'p\x1F\x18\x03'
    })
});

test('$format - $repeat - simple', t => {
    let struct = {
        a: {
            $repeat: 3,
            $format: 'byte'
        },
    };
    let sb = new StreamBuffer(Buffer.alloc(3));
    sb.writeByte(1);
    sb.writeByte(2);
    sb.writeByte(255);
    
    let result = b.readStruct(struct, sb.buffer);

    t.deepEqual(result, {
        a: [1, 2, 255],
    })
});

test('$format - $repeat - by sibling value', t => {
    let struct = {
        num: {
            $format: 'byte',
        },
        a: {
            $repeat: 'num',
            $format: 'byte'
        },
    };
    let sb = new StreamBuffer(Buffer.alloc(4));
    sb.writeByte(3); // num
    sb.writeByte(1);
    sb.writeByte(2);
    sb.writeByte(255);
    
    let result = b.readStruct(struct, sb.buffer);

    t.deepEqual(result, {
        num: 3,
        a: [1, 2, 255],
    })
});

test('$format - $repeat - nested', t => {
    let struct = {
        shape: {
            $format: {
                numPoints: 'byte',
                points: {
                    $repeat: 'numPoints',
                    $format: {
                        x: 'byte',
                        y: 'byte'
                    },
                },
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
                    y: 100
                },
                {
                    x: 4,
                    y: 200
                }
            ]
        }
    })
});

test('$switch - nested', t => {
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
                        { $case: 1, $format: ['byte', 'byte'],  },
                    ]
                }
            }
        }
    };
    let sb = new StreamBuffer(Buffer.alloc(24));
    sb.writeByte(2); // numObjects
    // Object 1
    sb.writeString7('Ball1')
    sb.writeByte(0); // dataType 0 (data is a single byte)
    sb.writeByte(50);
    // Object 2
    sb.writeString7('Square1')
    sb.writeByte(1); // dataType 1 (data is a two bytes)
    sb.writeByte(10);
    sb.writeByte(255);
    
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
            }
        ]
    })
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
                    $format: 'byte',
                },
                hobbies: {
                    $format: 'string7',
                    $repeat: 'numHobbies'
                }
            }
        }
    };
    let sb = new StreamBuffer(Buffer.alloc(92));
    sb.writeByte(2); // numPersons
    // Person 1
    sb.writeString7('John') // firstName
    sb.writeString7('A'); // lastName
    sb.writeString7('New York')
    sb.writeString7('1st Ave.');
    sb.writeUInt16LE(1165);
    sb.writeString7('10065')
    sb.writeByte(3); // 3 hobbies
    sb.writeString7('eating');
    sb.writeString7('coding');
    sb.writeString7('walking');

    // Person 2
    sb.writeString7('Betty') // firstName
    sb.writeString7('B'); // lastName
    sb.writeString7('York')
    sb.writeString7('Bridge St.');
    sb.writeUInt16LE(1);
    sb.writeString7('YO1 6DD')
    sb.writeByte(0); // 0 hobbies
    
    let result = b.readStruct(struct, sb.buffer);

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
              hobbies: [ 'eating', 'coding', 'walking' ]
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
    })
});