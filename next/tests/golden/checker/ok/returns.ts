function sign(n: i32): i32 {
  if (n < 0) {
    return -1;
  } else if (n === 0) {
    return 0;
  } else {
    return 1;
  }
}
function forever(): i32 {
  while (true) {
    return 1;
  }
}
function nothing(): void {
  return;
}
nothing();
console.log(sign(-4), forever());
