function f(): i32 {
  let last: i32 = 0;
  for (let i: i32 = 0; i < 3; i++) {
    const g = (): i32 => i;
    last = g();
  }
  return last;
}
console.log(f());
