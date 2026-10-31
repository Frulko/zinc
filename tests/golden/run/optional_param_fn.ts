// A function whose parameter is optional, passed where one that takes it is expected (a component `Button(props?: P)` given to a generic
// `(p: Q) => R`): one function shape for both, on every engine.
interface Props { label: string }
function Button(p?: Props): i32 { return p === undefined || p === null ? 0 : p.label.length; }
function props<Q, R>(c: (p: Q) => R, p: Q): Q { return p; }
const x = props(Button, { label: 'save' });
const run = (f: (p: Props | null) => i32): i32 => f(x);
console.log(`${run(Button)} ${Button()}`);
