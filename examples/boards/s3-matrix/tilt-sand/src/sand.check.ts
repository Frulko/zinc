// Self-check of the sand rules: `zinc run examples/boards/s3-matrix/tilt-sand/src/sand.check.ts --target sim`.
// 16 grains poured down in an 8x8 box must end as the two bottom rows; poured right, as the two right columns, at rest.
import { Sand } from './sand';

function settle(s: Sand, gx: i32, gy: i32): void { for (let i: i32 = 0; i < 64; i++) s.step(gx, gy); }

const s = new Sand(8, 8);
for (let i: i32 = 0; i < 16; i++) s.drop(0xffffff);
settle(s, 0, 1);
let bottom: i32 = 0, right: i32 = 0;
for (let x: i32 = 0; x < 8; x++) for (let y: i32 = 6; y < 8; y++) if (s.at(x, y) !== 0) bottom++;
settle(s, 1, 0);
for (let y: i32 = 0; y < 8; y++) for (let x: i32 = 6; x < 8; x++) if (s.at(x, y) !== 0) right++;
const still = s.step(1, 0);  // settled sand must not keep moving
console.log(bottom === 16 && right === 16 && still === 0 ? 'sand ok' : `sand FAILED: bottom ${bottom}, right ${right}, moving ${still}`);
