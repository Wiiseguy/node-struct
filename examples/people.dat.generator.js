const { writeFileSync } = require('fs');
const { StreamBuffer } = require('streambuf');
const sb = StreamBuffer.from(Buffer.alloc(92));

sb.writeByte(2); // numPersons

// Person 1
sb.writeString7('John'); // firstName
sb.writeString7('A'); // lastName
sb.writeString7('New York');
sb.writeString7('1st Ave.');
sb.writeUInt16LE(1165);
sb.writeString7('10065');
sb.writeByte(3); // 3 hobbies
sb.writeString7('eating');
sb.writeString7('coding');
sb.writeString7('walking');

// Person 2
sb.writeString7('Betty'); // firstName
sb.writeString7('B'); // lastName
sb.writeString7('York');
sb.writeString7('Bridge St.');
sb.writeUInt16LE(1);
sb.writeString7('YO1 6DD');
sb.writeByte(0); // 0 hobbies


writeFileSync(__dirname + '/people.dat', sb.buffer);
