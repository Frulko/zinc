// Step 2: x goes back when it passes width().
import * as sys from 'zinc:sys';
import * as fs from 'zinc:fs';

const src = fs.readText(sys.args()[0]);
sys.exit(/if\s*\(\s*x\s*>=?\s*width\(\)/.test(src) ? 0 : 1);
