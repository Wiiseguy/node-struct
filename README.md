# node-structor
> Convert binary file data to JavaScript objects


## Installation
`npm i node-structor`

## Usage
In the example below we will be reading a list of people from a binary source.
```js
const fs = require('fs');
const Structor = require('node-structor');

const structDef = {
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

let result = Structor.readStruct(structDef, fs.readFileSync('./examples/people.dat'));

console.log(result);
```
> Not that `'string7'` is used - this denotes a string that is prepended by the length of that string. [Reference](https://msdn.microsoft.com/en-us/library/system.io.binarywriter.write7bitencodedint(v=vs.110).aspx).

Running this will log the following:
```js
{
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
}
```

## API

### `readStruct(structDef, buffer, [options])`
Reads the binary data from the buffer according to the structure definition. Returns a JavaScript object.

### `writeStruct(obj, structDef, data, [options])`
Writes the an object to a binary buffer according to the structure definition. Returns the number of bytes written.

### `sizeOf(structDef, [size = 4096])`
Calculates the size of the binary data that would be written according to the structure definition. The size parameter is optional and defaults to 4096; it references the size of the buffer that will be allocated to be able to calculate the size of the data.

## Types

| Type | Description
-------|---------
| `byte`   | Unsigned byte (0 to 255)
| `uint8`  | Unsigned byte (0 to 255)
| `sbyte`  | Signed byte (-128 to 127)
| `int8`   | Signed byte (-128 to 127)
| `uint16` | 16-bit unsigned integer (0 to 65,535)
| `int16`  | 16-bit signed integer (-32,768 to 32,767)
| `uint32` | 32-bit unsigned integer (0 to 4,294,967,295)
| `int32`  | 32-bit signed integer (-2,147,483,648 to 2,147,483,647)
| `uint64` | 64-bit unsigned integer (read as `BigInt`)
| `int64`  | 64-bit signed integer (read as `BigInt`)
| `char_*` | A string of characters with its length defined by the `*`. e.g. `char_28`
| `string0`| A string of characters terminated by a zero (0) byte. When used with writeStruct, it will write the string with a zero byte at the end.
| `string7`| A string of characters prepended by its [7-bit encoded](https://msdn.microsoft.com/en-us/library/system.io.binarywriter.write7bitencodedint(v=vs.110).aspx) length
| `string` | Can only be used in conjunction with `$format`. Read `$length` amount of bytes as a new string. Can also be used with `$encoding` to specify the encoding. Default is `utf8`.
| `buffer` | Can only be used in conjunction with `$format`. Read `$length` amount of bytes as a new `Buffer`. 

> Note: By default the endianness is little-endian (LE) - But you can explicitly define the endianness e.g. `int16be`, `uint64le`, etc.

## Directives 
### `$format`
Define the format. This can be any of the types mentioned above, or another structure definition.

Examples:

```js
{ 
    someNumber: {
        $format: 'uint16'    // Results in a single number
    },
    anotherNumber: 'uint16'  // Short-hand for the above
}
```

Some types only work in conjunction with `$format`, as they require extra information to be on the same level. These are: `string` and `buffer`.

Examples:

```js
{
    name: {
        $format: 'string',
        $length: 32,
        $encoding: 'ascii' // $encoding is optional, default is 'utf8'
    }
}
```
```js
{
    blobData: {
        $format: 'buffer',
        $length: 64000
    }
}
```

### `$repeat`
Repeats the specified `$format`. Can be a number or the name of a property containing the value.

Examples:

```js
{
    $format: 'byte',
    $repeat: 2
}
```
```js
{
    numObjects: 'byte',
    objects: {
        $format: {
            ...
        },
        $repeat: 'numObjects'
    }
}
```

### `$foreach`
A special form of `$repeat`. Must be a referenced value pointing to a previously read `array` combined with an alias.

Examples:
```js
{
    numFiles: 'uint16',
    fileTable: {
        $repeat: 'numFiles',
        $format: {
            name: 'char_24',
            address: 'uint32',
            length: 'uint32'
        }
    },
    files: {
        // Iterate over each item in fileTable as 'file'
        $foreach: 'fileTable file', 
        $format: {
            fileName: {
                $value: 'file.name',
                $format: 'char_24'
            },
            fileContent: {
                $goto: 'file.address',
                $format: 'buffer',
                $length: 'file.length'
            }
        }
    }
}
```

### `$switch`
Read the next data differently based on a previously read value.

Examples:
```js
{
    type: 'byte',
    shape: {
        $switch: 'type',
        $cases: [
            {
                $case: 1, // when type is 1, assume circle data follows
                $format: {
                    radius: 'uint32'
                }
            },
            {
                $case: 2, // 2 = square data
                $format: {
                    width: 'uint16',
                    height: 'uint16'
                }
            },
            {
                $case: 3, // 2 = polygonal data
                $format: {
                    numPoints: {
                        $ignore: true,
                        $format: 'byte'
                    },
                    points: {
                        $repeat: 'numPoints',
                        $format: 'byte'
                    }
                }
            }
        ]
    }
}
// Which could result in:
{
    type: 1,
    shape: {
        radius: 38892
    }
},
{
    type: 2,
    shape: {
        width: 96,
        height: 128
    }
},
{
    type: 3,
    shape: {
        points: [0, 2, 128, 24, 255, 8]
    }
}
```

### `$ignore`
Read the data, but don't put the property in the eventual JS object.

Examples:

```js
numObjects: {
    $format: 'byte',
    $ignore: true
}
```

### `$goto`
Jumps to the specified byte location before reading the value.

Examples:

```js
signature: {
    $goto: 0xf0,
    $format: 'char_2'    
}
```
### `$skip`
Skips the specified number of bytes before reading the value.

Examples:

```js
startOfHeader: {
    $skip: 255,
    $format: 'uint16'    
}
```

### `$length`
Can only be used in conjunction with `$format: 'string'` and **must** be used when `$format: 'buffer'`.

Examples:
```js
firstName: {
    $format: 'string',
    $length: 32
}
```
> Note: when `$format` is `'string'`, `$length` is optional. If not present, characters will be read until a zero-byte is encountered.

```js
blobData: {
    $format: 'buffer',
    $length: 64000
}
```



### `$encoding`
Can only be used in conjunction with `$format: 'string'`.

Examples:
```js
firstName: {
    $format: 'string',
    $encoding: 'ascii'
}
```
> Note: the default value for `$encoding` is `'utf8'`

### `$value`
A special directive that doesn't read anything from the buffer and thus doesn't move the internal cursor. Used to copy a value from another source.

```js
{
    name: 'string',
    nameCopy: {
        $value: 'name',
        $format: 'uint32'
    }
}
```

### `$tell`
A special directive that reads the current position of the internal cursor. Must be used in conjunction with `$format: '$tell'`.

```js
{
    name: 'string',
    currentAddress: {
        $format: '$tell',
        $tell: 'uint16'
    }
}
```

## Referenced values
Every numeric directive supports passing a reference value string instead of a hard-coded integer. This can be a simple name pointing to a sibling value, or a more complex path.

Examples:

```js
{
    nameLength: 'byte',
    myName: {
        $format: 'string',
        $length: 'nameLength'
    }
}
```

```js
{
    header: {
        config: {
            nameLength: 'byte'
        }
    },
    myName: {
        $format: 'string',
        $length: 'header.config.nameLength'
    }
}
```

Directives that support this:
- `$repeat`
- `$switch`
- `$length`
- `$goto`
- `$skip`
- `$value`