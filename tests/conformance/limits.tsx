// Fixes for the documented limits: Map/Set/function identity, aliased imports, inherited text color, per-side borders.
import * as ui from 'zinc:ui';
import { twice as double } from './support/limits_mod';
import { twice as viaLink } from './support/via-link/limits_mod';  // a symlink to the same file: one module

// === on Map, Set and functions is reference identity
const a = new Map<string, number>(); const b = a; const c = new Map<string, number>();
const s = new Set<number>(); const t = s;
console.log('map', a === b, a === c, a !== c, 'set', s === t);
const f = double, g = double;
console.log('fn', f === g, double(21), 'symlinked module', viaLink === double);

// text color comes from the nearest ancestor that sets one (any element), like CSS `color`
const root = ui.createNode(ui.VIEW);
ui.setClass(root, 'flex-col text-red-500 border-b-2 border-zinc-200');
const inner = ui.createNode(ui.VIEW);
ui.setClass(inner, 'border-x border-t-4');
ui.insert(root, inner, -1);
const plain = ui.createText('inherits red');
ui.insert(inner, plain, -1);
const own = ui.createText('own blue');
ui.setClass(own, 'text-blue-500');
ui.insert(inner, own, -1);
ui.setRoot(root);
console.log(ui.dump());
console.log('fg', ui.textFg(plain), ui.textFg(own));
ui.setClass(root, 'flex-col text-emerald-600');
console.log('fg after class change', ui.textFg(plain));
