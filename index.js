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
	uint8: 'Byte',
	uint16: 'UInt16',
	uint32: 'UInt32',
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

		if(def.$format) {
			if(def.$format === 'string') {
				let length = resolve(def.$length);
				let encoding = def.$encoding;
				val = sb.readString(length, encoding);
			} else if(def.$repeat) {
				val = [];
				let numRepeat = resolve(def.$repeat);
				for(let i = 0; i < numRepeat; i++) {
					let obj = _read(def.$format, sb, {}, scopes, name);
					val.push(obj);
				}
			} else {
				val = _read(def.$format, sb, {}, scopes, name);
			}
		} else if(def.$switch) {
			let numCase = struct[def.$switch];			
			let foundCase = def.$cases.find(c => c.$case == numCase);	
			if(foundCase) {
				val = _read(foundCase.$format, sb, {}, scopes, name);
			}
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
				case 'uint16le':
				case 'uint32le':					
					val = sb[composeOperationName(baseDef, EndianModes.LE)](); 
					break;
				case 'int16be':
				case 'int32be':
				case 'uint16be':
				case 'uint32be':
					val = sb[composeOperationName(baseDef, EndianModes.BE)](); 
					break;
				case 'int16':				
				case 'int32':
				case 'uint16':
				case 'uint32': 
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
	Object.entries(def).forEach(e => {
		let [name, type] = e;
		let val = _read(type, sb, struct, scopes, name);		
		//struct[name] = val;
	});

	return struct;
}

function readStruct(def, buffer, options) {	
	options = {
		offset: 0,
		...options
	};

	let sb = StreamBuffer(buffer);
	sb.seek(options.offset);

	let result = _readStruct(def, sb, {});
	return result;
}

module.exports = {
	EndianModes,

	readStruct
}