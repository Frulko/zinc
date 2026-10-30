// Step 3: the window's size printed with console.log, width() and height().
import * as sys from 'zinc:sys';
import * as fs from 'zinc:fs';

const src = fs.readText(sys.args()[0]);
sys.exit(/console\.log\s*\(/.test(src) && /width\(\)/.test(src) && /height\(\)/.test(src) ? 0 : 1);
