// Step 2: the four arrows move the square.
import * as sys from 'zinc:sys';
import * as fs from 'zinc:fs';

const src = fs.readText(sys.args()[0]);
sys.exit(/Btn\.Right/.test(src) && /Btn\.Up/.test(src) && /Btn\.Down/.test(src) ? 0 : 1);
