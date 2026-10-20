// s[i] on a string (ZN-155): a one-character string, as String.charAt (past the end: '', where JavaScript gives undefined).
const s = 'abc';
console.log(s[1], s[s.length - 1] + '!', ('x' + 'yz')[2]);
let out = '';
for (let i = s.length - 1; i >= 0; i--) out += s[i];
console.log(out);
