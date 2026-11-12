function shadow(value: i32): i32 {
  { let value: i32 = 8; console.log('inner', value); }
  return value;
}
function siblings(): i32 {
  { let later: i32 = 9; console.log('sibling', later); }
  function read(): i32 { return later; }
  return read();
}
function patterns({item}: {item: i32}, [part]: i32[]): i32 {
  let {extra} = {extra: 3};
  let [last] = [4];
  for (let item: i32 = 0; item < 1; item++) console.log('loop', item);
  for (const part of [5]) console.log('of', part);
  return item + part + extra + last;
}
console.log('shadow', shadow(7));
console.log('patterns', patterns({item: 1}, [2]));
try { siblings(); } catch (e) { console.log('tdz', e instanceof ReferenceError); }
const value: i32 = 100;
const later: i32 = 21;
console.log('ready', siblings(), value);
