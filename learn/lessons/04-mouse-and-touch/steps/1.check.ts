// Step 1: a dot drawn at pointerX() and pointerY().
import * as sys from 'zinc:sys';
import * as fs from 'zinc:fs';

const src = fs.readText(sys.args()[0]);
sys.exit(/pointerX\(\)/.test(src) && /pointerY\(\)/.test(src) && /\brrect\s*\(/.test(src) ? 0 : 1);
