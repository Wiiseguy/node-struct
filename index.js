const StreamBuffer = require('streambuf');

const EndianModes = {
	LE: "LE",
	BE: "BE"
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
	string7: 'String7'
}

const defaultEndianMode = EndianModes.LE;

function composeOperationName(type, endianMode) {
	return 'read' + Mapping[type] + endianMode;
}

function composeDefaultOperationName(type) {
	return composeOperationName(type, defaultEndianMode);
}

function resolvePath(obj, path) {
	let result = obj;
	let parts = path.split('.');
	while(parts.length > 0) {
		let p = parts.shift();
		result = result[p];
	}
	return result;
}

function _findInScopes(path, scopes) {
	let name = path;
	let dotIndex = name.indexOf('.');
	if(dotIndex !== -1) {
		name = name.substr(0, dotIndex);
	}
	const scope = scopes.find(s => {
		return s[name] != undefined;
	});
	if(scope) {
		return resolvePath(scope, path);
	} else {
		throw new Error(`'${name}' not found in scope.`);
	}
}

function _read(def, sb, struct, scopes, name) {
	if(scopes == undefined) throw new Error('_read: "scopes" should be defined.');	
	
	scopes.unshift(struct);	
	
	let val, ignore = false;

	const resolve = q => {
		if(Number.isInteger(q)) {
			return q;
		}
		if(typeof q === 'string') {
			return _findInScopes(q, scopes);
		}
		return null;
	}

	if(Array.isArray(def)) {
		val = [];
		for(let i = 0; i < def.length; i++) {
			let obj = _read(def[i], sb, {}, scopes, name);
			val.push(obj);
		}
	}
	else if(typeof def === 'object') {
		if(def.$ignore) {
			ignore = true;
		}
		if(def.$goto != null) {
			let pos = resolve(def.$goto);
			sb.seek(pos);
		} else if(def.$skip != null) {
			let skip = resolve(def.$skip);
			sb.skip(skip);
		}

		if(def.$value) {
			val = resolve(def.$value);
		} else if(def.$format) {
			if(def.$format === '$tell') {
				val = sb.tell();
			} else if(def.$format === 'string') {
				let length = resolve(def.$length);
				let encoding = def.$encoding;
				val = sb.readString(length, encoding);
			} else if(def.$format === 'buffer') {
				let length = resolve(def.$length);
				if(!length) throw new Error("When $format = 'buffer', $length must be an integer greater than 0.");
				val = sb.read(length).buffer;
			} else if(def.$repeat) {
				val = [];
				let numRepeat = resolve(def.$repeat);
				for(let i = 0; i < numRepeat; i++) {
					let obj = _read(def.$format, sb, {}, scopes, name);
					val.push(obj);
				}
			} else if(def.$foreach) {
				val = [];
				let [listName, listAlias] = def.$foreach.split(' ');
				let list = resolve(listName);
				if(!Array.isArray(list)) throw new Error(`$foreach: ${listName} must be an array.`)
				if(!listAlias) throw new Error(`$foreach: item alias is missing, e.g. 'a' in $foreach: "${listName} a"`);

				for(let i = 0; i < list.length; i++) {
					let itemScope = {};
					itemScope[listAlias] = list[i];
					let itemScopes = [...scopes, itemScope];
					let obj = _read(def.$format, sb, {}, itemScopes, name);
					val.push(obj);
				}
			} else {
				val = _read(def.$format, sb, {}, scopes, name);
			}
		} else if(def.$switch) {
			let numCase = resolve(def.$switch);
			let foundCase = def.$cases.find(c => c.$case == numCase);	
			if(foundCase) {
				val = _read(foundCase.$format, sb, {}, scopes, name);
			}
			// TODO: throw when not found
		} else {			
			val = {};
			Object.entries(def).forEach(e => {
				let [name, type] = e;
				val[name] = _read(type, sb, val, scopes, name);
			});			
		} 
	} else {
		if(def.startsWith('char')) {
			let [_, len] = def.split('_');
			len = Math.max(1, len);
			val = sb.readString(len);
		} else {
			const baseDef = def.slice(0, -2); // remove last two chars (be/le)
			switch(def) {
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
					val = sb[composeOperationName(baseDef, EndianModes.LE)](); 
					break;
				case 'int16be':
				case 'int32be':
				case 'int64be':
				case 'uint16be':
				case 'uint32be':
				case 'uint64be':
					val = sb[composeOperationName(baseDef, EndianModes.BE)](); 
					break;
				case 'int16':				
				case 'int32':
				case 'int64':
				case 'uint16':
				case 'uint32':
				case 'uint64':
					val = sb[composeDefaultOperationName(def)](); 
					break;
				case 'string':
					val = sb.readString();
					break;
				case 'string7': 
					val = sb.readString7(); 
					break;
				default: throw new Error(`Unknown struct type: '${def}' for '${name}'`);
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

function _readStruct(def, sb, struct) {
	let scopes = [struct];
	if(typeof def === 'object') {
		Object.entries(def).forEach(e => {
			let [name, type] = e;
			_read(type, sb, struct, scopes, name);					
		});

		return struct;
	} else if (typeof def === 'string') {
		return _read(def, sb, struct, scopes, 'value')
	}
}

function readStruct(def, buffer, options) {	
	options = {
		offset: 0,
		...options
	};

	let sb = new StreamBuffer(buffer);
	sb.seek(options.offset);

	let result = _readStruct(def, sb, {});
	console.log("EOF:", sb.isEOF(), "| tell():", sb.tell(), sb.tell().toString(16))
	return result;
}

function sizeOf(def) {
	let buffer = new FakeBuffer();
	let sb = new StreamBuffer(buffer);
	_readStruct(def, sb, {});
	return sb.tell();
}

function FakeBuffer() {
	Object.keys(Buffer.prototype).forEach(bp => {
		this[bp] = function() { return 0; }
	});
}
FakeBuffer.prototype = Object.create(Buffer.prototype);     

module.exports = {
	EndianModes,

	readStruct,
	sizeOf
}