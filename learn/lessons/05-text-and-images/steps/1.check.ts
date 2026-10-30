// Step 1: a title written with drawText.
import * as sys from 'zinc:sys';
import * as fs from 'zinc:fs';

const src = fs.readText(sys.args()[0]);
sys.exit(/drawText\s*\(/.test(src) ? 0 : 1);
