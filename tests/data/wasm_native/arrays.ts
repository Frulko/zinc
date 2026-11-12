import n from './plugins/array-probe';
import R from '../../../plugins/3d/native/render3d.spec';
function check(ok: boolean): void { if (!ok) throw new Error('native array copyback failed'); }
const b: u8[] = [1], i: i32[] = [2, 3], u: u32[] = [2147483648, 4294967295], d: number[] = [];
const result = n.edit(b, i, u, d);
check(b.length === 3 && b[0] === 255 && b[2] === 2);
check(i.length === 1 && i[0] === -2147483648);
check(u.length === 2 && u[0] === 4294967295 && u[1] === 2147483648);
check(d.length === 3 && 1 / d[0] < 0 && d[1] === 0.25 && d[2] === -2.5);
check(result.length === 2 && result[0] === -2147483648 && result[1] === 2147483647);
const same: i32[] = [1]; n.alias(same, same); check(same.length === 1 && same[0] === 7);
check(n.clear(b, i, u, d) === 'all empty');
check(b.length === 0 && i.length === 0 && u.length === 0 && d.length === 0);
n.voidValue();
const doubles = n.doubles(); check(doubles.length === 3 && 1 / doubles[0] < 0 && doubles[1] === .25 && doubles[2] === -2.5);
const world: number[] = [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0];
const parent: number[] = [1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
R.transform(world,parent,[2,3,4],[0,0,0,1],[1,1,1]);
check(world[0] === 1 && world[5] === 1 && world[10] === 1 && world[12] === 2 && world[13] === 3 && world[14] === 4 && world[15] === 1);
console.log('wasm native array copyback and Render3D transform passed');

const part: u8[] = [2,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,128,191,0,0,0,64,0,0,64,64,0,0,128,64,0,0,160,192,0,0,192,64];
const bounds: number[] = [0,0,0,0,0,0,0];
check(R.partBounds(part,0,bounds));
check(bounds[0] === -1 && bounds[1] === -5 && bounds[2] === 3 && bounds[3] === 4 && bounds[4] === 2 && bounds[5] === 6 && bounds[6] === Math.sqrt(20.75));
