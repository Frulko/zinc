// Step 2: the dot only while the button is down.
import * as sys from 'zinc:sys';
import * as fs from 'zinc:fs';

const src = fs.readText(sys.args()[0]);
sys.exit(/pointerDown\(\)/.test(src) ? 0 : 1);
