// `import * as ns`: `i < ns.A.length` in a for loop (the parser tries a type argument list there and drops it; the dropped type made
// the import `A.length`, refused as not exported), and a function returning something passed where one returning void is expected (an
// async handler: its Promise is dropped, as in TypeScript).
import * as bits from './modules/ns_bits';
let n = 0;
for (let i = 0; i < bits.BITS.length; i++) n += bits.BITS[i];
console.log(n, bits.BITS.length);
function onEach(f: (x: i32) => void): void { f(1); f(2); }
let seen = 0;
onEach(async (x: i32): Promise<void> => { seen += x; });
const g: (x: i32) => void = (x: i32): string => `${x}`;
g(3);
console.log('seen', seen);
