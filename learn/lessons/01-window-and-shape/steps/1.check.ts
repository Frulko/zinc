// Step 1: a rectangle drawn with rect().
import * as sys from 'zinc:sys';
import * as fs from 'zinc:fs';

const src = fs.readText(sys.args()[0]);
sys.exit(/\brect\s*\(/.test(src) ? 0 : 1);
