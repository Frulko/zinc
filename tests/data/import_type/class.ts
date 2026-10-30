// A class named by `import type` alone: its shape, none of its code (side.ts does not run)
import type { Player } from './side';
let p: Player | null = null;
console.log(`${p === null}`);
