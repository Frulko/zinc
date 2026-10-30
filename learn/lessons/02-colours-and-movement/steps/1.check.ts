// Step 1: x grows with SPEED * dt in the frame.
import * as sys from 'zinc:sys';
import * as fs from 'zinc:fs';

const src = fs.readText(sys.args()[0]);
sys.exit(/x\s*\+=\s*SPEED\s*\*\s*dt|x\s*=\s*x\s*\+\s*SPEED\s*\*\s*dt/.test(src) ? 0 : 1);
