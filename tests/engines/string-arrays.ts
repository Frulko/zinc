const retained = 'héllo/🦀/end'.split('/');
console.log('split', retained.length, retained.join('|'));
console.log('edges', ''.split('/').length, '/a//'.split('/').join(','), 'abc'.split('').join('-'));
const numbers: i32[] = [1, -2, 3];
const flags: boolean[] = [true, false];
console.log('numeric', numbers.join(), flags.join('/'));
let size: i32 = 0;
for (let i: i32 = 0; i < 2000; i++) size += `value/${i}/end`.split('/').join(':').length;
console.log('retained', retained[1], size);
