const s: string = 'abc';
s.push('d');
s.length = 2;
const t: i32 = s.charCodeAt('0');
const u: string = s.slice(1, 2, 3);
const names: i32[] = [1, 2];
console.log(names.join(','));
