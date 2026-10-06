// A fixture for the baker (ZN-048): text sizes from several notations, non-ASCII characters in literals, and an assets directory with a PNG and two SVGs.
import { onFrame, clear, font, drawText, image, drawImage } from 'zinc:gfx';
const a = font('sans', 14), b = font('sans-bold', 22), m = font('mono', 13);
const title = 'Résumé — naïve café ✓';
const css = 'font-size: 19px; text-xl text-[27px] text-3xl font-mono';
onFrame((dt: number) => { clear(0xffffff); drawText(a, 4, 4, title + css, 0, 255, 0); drawText(b, 4, 30, 'Zinc', 0, 255, 0); drawText(m, 4, 60, 'mono', 0, 255, 0); drawImage(image('home.svg'), 4, 90, 32, 32, 255, 0); });
