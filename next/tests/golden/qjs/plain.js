// Plain JavaScript on QuickJS: modules, closures, promises, timers on the virtual clock, console.log formatting like Node's.
import { twice } from './lib.mjs';
const log = [];
setTimeout(() => console.log('t100', log.join(',')), 100);
setTimeout(() => { log.push('t10'); }, 10);
const iv = setInterval(() => { log.push('i'); if (log.length > 3) clearInterval(iv); }, 30);
Promise.resolve(twice(21)).then(v => console.log('promise', v));
(async () => { await null; console.log('async', await Promise.resolve([1, 2, { a: 'x', b: [3] }])); })();
console.log(new Map([['k', 1]]), new Set([1, 2]), [1.5, -0, 'a'], { nested: { deep: { deeper: { deepest: 1 } } } });
console.log(Array.from({ length: 30 }, (_, i) => i * 3));
console.log(typeof __host_gfxRect, typeof __host_fsReadText, typeof __host_procSpawn);
