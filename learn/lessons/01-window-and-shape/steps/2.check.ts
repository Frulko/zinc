// Step 2: a round shape drawn with rrect().
import * as sys from 'zinc:sys';
import * as fs from 'zinc:fs';

const src = fs.readText(sys.args()[0]);
sys.exit(/\brrect\s*\(/.test(src) ? 0 : 1);
