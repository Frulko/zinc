// The program tests/v8_inspect_check.mjs debugs on --engine v8 (ZN-773.05).
function twice(x) {
  const y = x * 2;
  debugger;
  return y;
}
console.log('hello', twice(21));
