// Machine integers convert among themselves on assignment, calls and returns, like the number type they alias.
let state: u32 = 88172645;
function next(): u32 {
  state ^= state << 13;
  state ^= state >>> 17;
  state ^= state << 5;
  return state >>> 0;
}
const k: i32 = next() % 50000;
const small: u8 = k % 200;
const wide: i64 = k;
function take(x: i16): i16 { return x; }
console.log(k, small, wide, take(k % 30000), take(300));
