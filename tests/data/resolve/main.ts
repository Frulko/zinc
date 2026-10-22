// One resolver for every engine (src/frontend/resolve.h): each import names the file it got, the same under zinc run, --engine quickjs and mquickjs.
import { TARGET } from 'zinc:platform';
import { which } from './which';
import { ext } from './ext';
import { idx } from './lib';
import { helper } from './helper.js';
import { mapped } from '@app/mapped';
const got: string = which + ' ' + ext + ' ' + idx + ' ' + helper + ' ' + mapped;
console.log(got);
// zinc check --target esp32 --engine mquickjs shows the program's output only when it fails: there the program checks itself
if (TARGET === 'esp32' && got !== 'which.esp32.ts ext.ts lib/index.esp32.ts helper.esp32.ts src/mapped.native.ts') throw new Error('resolved ' + got);
