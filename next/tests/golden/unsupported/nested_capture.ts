function outer(n: i32): i32 {
  function inner(): i32 {
    return n + 1;
  }
  return inner();
}
console.log(outer(1));
