// The e-ink plan's code-drawn part (ZN-934): windows, which the colour app draws by code too. Floors, decor and portraits are the official SVG artwork baked in black and white
// (assets/ink-*.png, authoring/build_assets.py), drawn by Manor.ts and Portrait.tsx.
import { rect } from 'zinc:gfx';
const K = 0x000000, W = 0xffffff;
/** A window in a wall: a white pane with a cross, straddling the wall. */
export function inkWindow(x: number, y: number, vertical: boolean): void {
 if (vertical) { rect(x-6,y+18,12,44,K); rect(x-4,y+20,8,40,W); rect(x-1,y+20,2,40,K); }
 else { rect(x+18,y-6,44,12,K); rect(x+20,y-4,40,8,W); rect(x+39,y-4,2,8,K); }
}
