// A function named by `import type` of a module no value import loads: refused with what to write instead
import type { draw } from './side';
let f: typeof draw | null = null;
console.log(`${f === null}`);
