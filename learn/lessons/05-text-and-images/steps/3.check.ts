// Step 3: the rocket picture loaded with image() and drawn with drawImage.
import * as sys from 'zinc:sys';
import * as fs from 'zinc:fs';

const src = fs.readText(sys.args()[0]);
sys.exit(/image\s*\(\s*'rocket\.svg'\s*\)|image\s*\(\s*\"rocket\.svg\"\s*\)/.test(src) && /drawImage\s*\(/.test(src) ? 0 : 1);
