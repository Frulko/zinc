// Step 3: the wheel changes the brush.
import * as sys from 'zinc:sys';
import * as fs from 'zinc:fs';

const src = fs.readText(sys.args()[0]);
sys.exit(/wheel\(\)/.test(src) ? 0 : 1);
