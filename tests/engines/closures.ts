function counter(start: i32): () => i32 {
  let n: i32 = start;
  return (): i32 => { n += 1; return n; };
}
function apply(f: (n: i32) => i32, n: i32): i32 { return f(n); }
const first = counter(10);
const second = counter(30);
console.log(first(), first(), second(), first());
function offset(n: i32): (x: i32) => i32 { return (x: i32): i32 => n + x; }
console.log(apply(offset(5), 9));
interface State { value: i32; }
function objectCapture(): () => i32 {
  const state: State = { value: 50 };
  return (): i32 => { state.value += 2; return state.value; };
}
const object = objectCapture();
console.log(object(), object());
function stress(): i32 {
  let result: i32 = 0;
  for (let i: i32 = 0; i < 20000; i++) { const f = counter(i); result = f(); }
  return result;
}
console.log(stress(), first(), object());

function twice(n: i32): i32 { return n * 2; }
const named = twice;
const namedAlias = named;
console.log(apply(named, 8), named === namedAlias);
function parameterCell(n: i32): () => i32 { return (): i32 => { n += 3; return n; }; }
const parameter = parameterCell(2);
console.log(parameter(), parameter());
