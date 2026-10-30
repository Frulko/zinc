// Step 3: a press of A changes the colour.
import * as sys from 'zinc:sys';
import * as fs from 'zinc:fs';

const src = fs.readText(sys.args()[0]);
sys.exit(/wasPressed\s*\(\s*Btn\.A\s*\)/.test(src) ? 0 : 1);
