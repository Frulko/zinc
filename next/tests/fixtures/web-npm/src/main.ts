import cond from 'cond-pkg';
import sub from 'cond-pkg/sub/path';
import cjs, { add, mode } from 'cjs-pkg';
import name, { twice, secretLen } from 'esm-pkg';
import { util } from 'esm-pkg/util';
import mapped from 'map-pkg';

// what the page reads back: the same JSON from `zinc dev` and from `zinc export`
const result = { cond, sub, add: add(2, 3), mode, helper: cjs.helper(), name: name(), twice: twice(21), secretLen, util, mapped, v: 1 };
(globalThis as any).__npmResult = JSON.stringify(result);
console.log('npm-result ' + JSON.stringify(result));
