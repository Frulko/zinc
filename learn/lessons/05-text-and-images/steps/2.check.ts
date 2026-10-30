// Step 2: the title centred with textWidth.
import * as sys from 'zinc:sys';
import * as fs from 'zinc:fs';

const src = fs.readText(sys.args()[0]);
sys.exit(/textWidth\s*\(/.test(src) ? 0 : 1);
