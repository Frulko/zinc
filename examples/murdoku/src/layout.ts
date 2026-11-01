import { puzzle } from './state';
import { createSignal } from 'zinc:ui/solid';
import { width, height } from 'zinc:gfx';
export const [viewport, setViewport] = createSignal(width());
export const [viewportHeight, setViewportHeight] = createSignal(height());
export function compact(): boolean { return viewport() < 1100 || viewportHeight() > viewport(); }
export function cellSize(): number {
 if (compact()) return Math.min(90,Math.floor((viewport()-56)/puzzle().columns));
 return Math.min(96,Math.floor((viewport()-560)/puzzle().columns),Math.floor((viewportHeight()-200)/puzzle().rows));
}
export function boardWidth(): number { return cellSize()*puzzle().columns+32; }
export function witnessWidth(): number { return compact() ? Math.min(viewport()-24,700) : 340; }
export const [mobileTab, setMobileTab] = createSignal('plan');
