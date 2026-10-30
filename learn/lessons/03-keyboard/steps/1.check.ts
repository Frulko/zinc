// Step 1: the left arrow moves the square.
import * as sys from 'zinc:sys';
import * as fs from 'zinc:fs';

const src = fs.readText(sys.args()[0]);
sys.exit(/isDown\s*\(\s*Btn\.Left\s*\)/.test(src) ? 0 : 1);
