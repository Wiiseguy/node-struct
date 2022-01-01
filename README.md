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
| `char_*` | A string of charactered with its length defined by the `*`. e.g. `char_28`
| `string` | A string terminated by a zero (0) byte or, when used with `$format`,  `$length` and `$encoding` can be specified 
| `string7` | A string of charactered prepended by its [7-bit encoded](https://msdn.microsoft.com/en-us/library/system.io.binarywriter.write7bitencodedint(v=vs.110).aspx) length

> Note: By default the endianness is little-endian (LE) - But you can explicitly define the endianness e.g. `int16be`, `uint32le`, etc.

## Directives 
### `$format`
Define the format.

Examples:

```js
$format: 'uint16'         // Results in a single number
```
```js
$format: {                // Results in an object
    a: 'byte',
    b: 'byte'
}
```
```js
$format: ['byte', 'byte'] // Results in an array with two items
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
        }
        $repeat: 'numObjects'
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
Can only be used in conjunction with `$format: 'string'`.

Examples:
```js
firstName: {
    $format: 'string',
    $length: 32
}
```
> Note: when `$format` is `'string'`, `$length` is optional. If not present, characters will be read until a zero-byte is encountered.

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
- `$length`
- `$goto`
- `$skip`