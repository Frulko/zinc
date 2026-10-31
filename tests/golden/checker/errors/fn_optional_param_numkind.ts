// A function with an optional parameter passed as a callback whose return is another machine number kind: refused, not one function shape
// (the fuzzer found it: the IR then cast between unrelated function classes).
interface Props { label: string }
function Button(p?: Props | null): i16 { return p === undefined || p === null ? 0 : p.label.length; }
function props<Q, R>(c: (p: Q) => R, p: Q): Q { return p; }
const x = props(Button, { label: 'save' });
const run = (f: (p: Props | null) => i32): i32 => f(x);
console.log(`${run(Button)} ${Button()}`);
