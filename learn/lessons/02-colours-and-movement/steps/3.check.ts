// Step 3: the background follows Math.sin of the time.
import * as sys from 'zinc:sys';
import * as fs from 'zinc:fs';

const src = fs.readText(sys.args()[0]);
sys.exit(/time\s*\+=\s*dt/.test(src) && /Math\.sin\s*\(/.test(src) ? 0 : 1);
