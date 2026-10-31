// A class named by `import type` alone: its shape, none of its code (side.ts does not run)
import type { Player } from './side';
let p: Player | null = null;
function across(q: Player): number { return q.pos.x; }
console.log(`${p === null}`);
