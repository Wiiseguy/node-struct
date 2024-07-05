const { StreamBuffer } = require('streambuf');

const EndianModes = {
    LE: 'LE',
    BE: 'BE'
};

const Mapping = {
    byte: 'Byte',
    sbyte: 'SByte',
    int8: 'Int8',
    int16: 'Int16',
    int32: 'Int32',
    int64: 'BigInt64',
    uint8: 'Byte',
    uint16: 'UInt16',
    uint32: 'UInt32',
    uint64: 'BigUInt64',
    float: 'Float',
    double: 'Double',
    string7: 'String7'
};

const defaultEndianMode = EndianModes.LE;

function composeReadOperationName(type, endianMode) {
    return 'read' + Mapping[type] + endianMode;
}

function composeDefaultReadOperationName(type) {
    return composeReadOperationName(type, defaultEndianMode);
}

function composeWriteOperationName(type, endianMode) {
    return 'write' + Mapping[type] + endianMode;
}

function composeDefaultWriteOperationName(type) {
    return composeWriteOperationName(type, defaultEndianMode);
}

function resolvePath(obj, path) {
    let result = obj;
    let parts = path.split('.');
    while (parts.length > 0) {
        let p = parts.shift();
        result = result[p];
    }
    return result;
}

function _findInScopes(path, scopes) {
    let name = path;
    let dotIndex = name.indexOf('.');
    if (dotIndex !== -1) {
        name = name.substr(0, dotIndex);
    }
    const scope = scopes.find(s => {
        return s != null && s[name] != null;
    });
    if (scope) {
        return resolvePath(scope, path);
    } else {
        throw new Error(`'${name}' not found in scope.`);
    }
}

function _resolve(q, scopes) {
    if (Number.isInteger(q)) {
        return q;
    }
    if (typeof q === 'string') {
        return _findInScopes(q, scopes);
    }
    return null;
}

function _read(def, sb, struct, scopes, name) {
    scopes.unshift(struct);

    let val,
        ignore = false;

    const resolve = q => {
        return _resolve(q, scopes);
    };

    if (Array.isArray(def)) {
        val = [];
        for (let i = 0; i < def.length; i++) {
            let obj = _read(def[i], sb, {}, scopes, name);
            val.push(obj);
        }
    } else if (typeof def === 'object') {
        if (def.$ignore) {
            ignore = true;
        }
        if (def.$goto != null) {
            let pos = Number(resolve(def.$goto));
            sb.seek(pos);
        } else if (def.$skip != null) {
            let skip = Number(resolve(def.$skip));
            sb.skip(skip);
        }
        if (def.$value != null && def.$format == null) {
            throw new Error(`$value must be used with $format`);
        }

        if (def.$format) {
            if (def.$value) {
                val = resolve(def.$value);
            } else if (def.$format === '$tell') {
                if (def.$tell == null)
                    throw new Error(`$format: '$tell' must have a $tell property containing its type`); // for compatibility with _write
                val = sb.tell();
            } else if (def.$repeat != null) {
                val = [];
                let numRepeat = resolve(def.$repeat);
                for (let i = 0; i < numRepeat; i++) {
                    let obj = _read(def.$format, sb, {}, scopes, name);
                    val.push(obj);
                }
            } else if (def.$foreach) {
                val = [];
                let [listName, listAlias] = def.$foreach.split(' ');
                let list = resolve(listName);
                if (!Array.isArray(list)) throw new Error(`$foreach: ${listName} must be an array.`);
                if (!listAlias)
                    throw new Error(`$foreach: item alias is missing, e.g. 'a' in $foreach: "${listName} a"`);

                for (const element of list) {
                    let itemScope = {};
                    itemScope[listAlias] = element;
                    let itemScopes = [...scopes, itemScope];
                    let obj = _read(def.$format, sb, {}, itemScopes, name);
                    val.push(obj);
                }
            } else if (def.$format === 'string') {
                let length = resolve(def.$length);
                let encoding = def.$encoding;
                val = sb.readString(length, encoding);
            } else if (def.$format === 'buffer') {
                let length = resolve(def.$length);
                if (!length) throw new Error("When $format = 'buffer', $length must be an integer greater than 0.");
                val = sb.read(length).buffer;
            } else {
                val = _read(def.$format, sb, {}, scopes, name);
            }
        } else if (def.$switch) {
            let numCase = resolve(def.$switch);
            let foundCase = def.$cases.find(c => c.$case == numCase);
            if (foundCase) {
                val = _read(foundCase.$format, sb, {}, scopes, name);
            } else {
                let defaultCase = def.$cases.find(c => c.$case == null);
                if (defaultCase) {
                    val = _read(defaultCase.$format, sb, {}, scopes, name);
                }
            }
        } else {
            val = {};
            Object.entries(def).forEach(e => {
                let [name, type] = e;
                val[name] = _read(type, sb, val, scopes, name);
            });
        }

        // TODO: need to re-consider this, as it is not compatible with writing back the struct
        //  May need a separate $mapRead and $mapWrite for this
        // if (def.$map) {
        //     if (typeof def.$map === 'function') {
        //         val = def.$map(val, name, struct, scopes);
        //     } else if (def.$map === 'number') {
        //         val = Number(val);
        //     }
        // }
    } else {
        if (def.startsWith('char')) {
            let [_, len] = def.split('_');
            len = Math.max(1, len);
            val = sb.readString(len);
        } else {
            const baseDef = def.slice(0, -2); // remove last two chars (be/le)
            switch (def) {
                case 'uint8':
                case 'byte':
                    val = sb.readByte();
                    break;
                case 'int8':
                case 'sbyte':
                    val = sb.readSByte();
                    break;
                case 'int16le':
                case 'int32le':
                case 'int64le':
                case 'uint16le':
                case 'uint32le':
                case 'uint64le':
                case 'floatle':
                case 'doublele':
                    val = sb[composeReadOperationName(baseDef, EndianModes.LE)]();
                    break;
                case 'int16be':
                case 'int32be':
                case 'int64be':
                case 'uint16be':
                case 'uint32be':
                case 'uint64be':
                case 'floatbe':
                case 'doublebe':
                    val = sb[composeReadOperationName(baseDef, EndianModes.BE)]();
                    break;
                case 'int16':
                case 'int32':
                case 'int64':
                case 'uint16':
                case 'uint32':
                case 'uint64':
                case 'float':
                case 'double':
                    val = sb[composeDefaultReadOperationName(def)]();
                    break;
                case 'string0':
                    val = sb.readString0();
                    break;
                case 'string7':
                    val = sb.readString7();
                    break;
                case 'string':
                    throw new Error(`string may only be used as a $format`);
                case 'buffer':
                    throw new Error(`buffer may only be used as a $format`);
                default:
                    throw new Error(`Unknown struct type: '${def}' for '${name}'`);
            }
        }
    }

    // Remove current scope from stack, MAKE SURE there is only ONE return statement in this function!
    scopes.shift();

    Object.defineProperty(struct, name, {
        value: val,
        enumerable: !ignore
    });

    return val;
}

function fixStringLength(str, len) {
    str = str.slice(0, len);
    str = str.padEnd(len, '\x00');
    return str;
}

/**
 *
 * @param {*} def
 * @param {StreamBuffer} sb
 * @param {*} val
 * @param {*} scopes
 * @param {*} name
 */
function _write(def, sb, val, scopes, name) {
    scopes.unshift(val);

    const resolve = q => {
        return _resolve(q, scopes);
    };

    if (typeof def === 'string') {
        if (def.startsWith('char')) {
            if (val == null) val = '';
            if (typeof val !== 'string') throw new Error(`_write: char_x: ${val} is not a string (${name})`);
            let [_, lenStr] = def.split('_');
            let len = Math.max(1, Number(lenStr));
            let str = fixStringLength(val, len);
            sb.writeString(str);
        } else {
            const baseDef = def.slice(0, -2); // remove last two chars (be/le)
            switch (def) {
                case 'uint8':
                case 'byte':
                    sb.writeByte(val);
                    break;
                case 'int8':
                case 'sbyte':
                    sb.writeSByte(val);
                    break;
                case 'int16le':
                case 'int32le':
                case 'int64le':
                case 'uint16le':
                case 'uint32le':
                case 'uint64le':
                case 'floatle':
                case 'doublele':
                    sb[composeWriteOperationName(baseDef, EndianModes.LE)](val);
                    break;
                case 'int16be':
                case 'int32be':
                case 'int64be':
                case 'uint16be':
                case 'uint32be':
                case 'uint64be':
                case 'floatbe':
                case 'doublebe':
                    sb[composeWriteOperationName(baseDef, EndianModes.BE)](val);
                    break;
                case 'int16':
                case 'int32':
                case 'int64':
                case 'uint16':
                case 'uint32':
                case 'uint64':
                case 'float':
                case 'double':
                    sb[composeDefaultWriteOperationName(def)](val);
                    break;
                case 'string0':
                    if (typeof val !== 'string') throw new Error(`_write: string: ${val} is not a string (${name})`);
                    sb.writeString0(val);
                    break;
                case 'string7':
                    if (typeof val !== 'string') throw new Error(`_write: string: ${val} is not a string (${name})`);
                    sb.writeString7(val);
                    break;
                case 'string':
                    throw new Error(`_write: string may only be used as a $format`);
                case 'buffer':
                    throw new Error(`_write: buffer may only be used as a $format`);
                default:
                    throw new Error(`Unknown struct type: '${def}' for '${name}'`);
            }
        }
    } else if (typeof def === 'object') {
        if (def.$goto != null) {
            let pos = resolve(def.$goto);
            sb.seek(pos);
        }
        if (def.$skip != null) {
            let skip = resolve(def.$skip);
            sb.skip(skip);
        }
        if (def.$value != null && def.$format == null) {
            throw new Error(`_write: $value must be used with $format`);
        }

        if (def.$format) {
            if (def.$value) {
                val = resolve(def.$value);
                _write(def.$format, sb, val, scopes, name);
            } else if (def.$format === '$tell') {
                if (def.$tell == null)
                    throw new Error(
                        `_write: $format: '$tell' must have a $tell property containing its type (${name})`
                    );
                let pos = sb.tell();
                _write(def.$tell, sb, pos, scopes, name);
            } else if (def.$repeat != null) {
                let numRepeat = resolve(def.$repeat);
                for (let i = 0; i < numRepeat; i++) {
                    let item = val[i];
                    _write(def.$format, sb, item, scopes, name);
                }
            } else if (def.$foreach) {
                let [listName, listAlias] = def.$foreach.split(' ');
                let list = resolve(listName);
                if (!Array.isArray(list)) throw new Error(`$foreach: ${listName} must be an array.`);
                if (!listAlias)
                    throw new Error(`$foreach: item alias is missing, e.g. 'a' in $foreach: "${listName} a"`);

                for (let i = 0; i < list.length; i++) {
                    let element = list[i];
                    let itemScope = {};
                    itemScope[listAlias] = element;
                    let itemScopes = [...scopes, itemScope];
                    _write(def.$format, sb, val[i], itemScopes, name);
                }
            } else if (def.$format === 'string') {
                if (typeof val !== 'string' && val != null)
                    throw new Error(`_write: string: ${val} is not a string (${name})`);
                let length = resolve(def.$length);
                if (!length)
                    throw new Error("_write: when $format = 'string', $length must be an integer greater than 0.");
                let encoding = def.$encoding;
                let str = val ?? '';
                if (length) {
                    str = fixStringLength(str, length);
                }
                sb.writeString(str, encoding);
            } else if (def.$format === 'buffer') {
                let length = resolve(def.$length);
                if (!length)
                    throw new Error("_write: when $format = 'buffer', $length must be an integer greater than 0.");
                sb.write(Buffer.from(val));
            } else {
                _write(def.$format, sb, val, scopes, name);
            }
        } else if (def.$switch) {
            let numCase = resolve(def.$switch);
            let foundCase = def.$cases.find(c => c.$case == numCase);
            if (foundCase) {
                _write(foundCase.$format, sb, val, scopes, name);
            } else {
                let defaultCase = def.$cases.find(c => c.$case == null);
                if (defaultCase) {
                    _write(defaultCase.$format, sb, val, scopes, name);
                }
            }
        } else {
            if (val == null) throw new Error(`_write: Can not read properties from missing '${name}'`);
            Object.entries(def).forEach(e => {
                let [name, type] = e;
                _write(type, sb, val[name], scopes, name);
            });
        }
    } else {
        throw new Error(`_write: Unknown def type: ${def} (${typeof def})`);
    }

    scopes.shift();
}

function readStruct(def, buffer, options) {
    options = {
        offset: 0,
        info: {},
        ...options
    };

    let sb = new StreamBuffer(buffer);
    sb.seek(options.offset);

    let result = _read(def, sb, {}, []);
    options.info.eof = sb.isEOF();
    options.info.pos = sb.tell();
    options.info.len = buffer.length;
    return result;
}

function writeStruct(obj, def, buffer, options) {
    options = {
        offset: 0,
        info: {},
        ...options
    };

    let sb = new StreamBuffer(buffer);
    sb.seek(options.offset);

    _write(def, sb, obj, []);

    // Return the number of bytes written
    return sb.tell();
}

function sizeOf(def, bufferSize = 4096) {
    let buffer = Buffer.alloc(bufferSize);
    let sb = new StreamBuffer(buffer);
    _read(def, sb, {}, []);
    return sb.tell();
}

module.exports = {
    EndianModes,

    readStruct,
    writeStruct,
    sizeOf
};
