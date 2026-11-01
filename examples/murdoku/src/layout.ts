import { puzzle } from './state';
import { INK } from './skin';
import { createSignal } from 'zinc:ui/solid';
import { width, height } from 'zinc:gfx';
export const [viewport, setViewport] = createSignal(width());
export const [viewportHeight, setViewportHeight] = createSignal(height());
export function compact(): boolean { return viewport() < (INK ? 960 : 1100) || viewportHeight() > viewport(); }
/** E-ink: the surface is 1080x810 or 810x1080 and nothing scrolls, so the plan takes what the witnesses, the tools and the header leave. */
export function inkWide(): boolean { return viewport() > viewportHeight(); }
export const INK_HEADER = 56, INK_CLUE = 30, INK_TOOLS = 168, INK_SIDE = 352, INK_WITNESSES = 335;
function inkCell(): number {
 const p = puzzle();
 if (inkWide()) return Math.min(Math.floor((viewport()-INK_SIDE-32)/p.columns),Math.floor((viewportHeight()-INK_HEADER-INK_CLUE-INK_TOOLS-32)/p.rows));
 return Math.min(Math.floor((viewport()-32)/p.columns),Math.floor((viewportHeight()-INK_HEADER-INK_CLUE-INK_TOOLS-INK_WITNESSES-32)/p.rows));
}
export function cellSize(): number {
 if (INK) return inkCell();
 if (compact()) return Math.min(INK ? 200 : 90,Math.floor((viewport()-56)/puzzle().columns));
 return Math.min(INK ? 200 : 96,Math.floor((viewport()-560)/puzzle().columns),Math.floor((viewportHeight()-200)/puzzle().rows));
}
export function boardWidth(): number { return cellSize()*puzzle().columns+32; }
export function witnessWidth(): number { return compact() ? Math.min(viewport()-24,700) : 340; }
export const [mobileTab, setMobileTab] = createSignal('plan');
