function outer(n: i32): i32 {
  function inner(k: i32): i32 {
    return k + n;
  }
  return inner(1);
}
console.log(outer(2));
