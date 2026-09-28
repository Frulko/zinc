// zinc:gfx — immediate-mode 2D API for games (UI-12). Colors are 0xRRGGBB.
declare module 'zinc:gfx' {
  export const enum Btn { Up = 0, Down = 1, Left = 2, Right = 3, A = 4, B = 5, X = 6, Y = 7, L = 8, R = 9, Start = 10, Select = 11 }
  /** Register the frame callback; dt in seconds. Runs after top-level code finishes. */
  export function onFrame(cb: (dt: number) => void): void;
  export function width(): i32;
  export function height(): i32;
  export function clear(color: u32): void;
  export function rect(x: number, y: number, w: number, h: number, color: u32): void;
  export function line(x1: number, y1: number, x2: number, y2: number, color: u32): void;
  /** Crisp 8px monospace grid, scaled by `scale` (legacy HUD text). */
  export function text(x: number, y: number, s: string, color: u32, scale: i32): void;
  /** Rounded rectangle; alpha 0..255. */
  export function rrect(x: number, y: number, w: number, h: number, r: number, color: u32, alpha: i32): void;
  /** Linear gradient from c1 to c2 (top to bottom when vertical, else left to right). */
  export function gradient(x: number, y: number, w: number, h: number, r: number, c1: u32, c2: u32, vertical: boolean, alpha: i32): void;
  export function border(x: number, y: number, w: number, h: number, r: number, width: number, color: u32, alpha: i32): void;
  /** Soft drop shadow of a rounded box. */
  export function shadow(x: number, y: number, w: number, h: number, r: number, blur: number, color: u32, alpha: i32): void;
  /** Filled polygon from flat [x0, y0, x1, y1, ...] points (anti-aliased). */
  export function polygon(points: number[], color: u32, alpha: i32): void;
  /** Several contours [count, x0, y0, ..., count, ...], nonzero winding (holes, vector art, Lottie). */
  export function path(contours: number[], color: u32, alpha: i32): void;
  /** Baked font: family "sans" | "sans-bold" | "mono" | "grid" at the nearest baked pixel size. */
  export function font(family: string, px: i32): i32;
  export function fontAscent(font: i32): i32;
  export function lineHeight(font: i32): i32;
  export function textWidth(font: i32, s: string, tracking: number): number;
  export function drawText(font: i32, x: number, y: number, s: string, color: u32, alpha: i32, tracking: number): void;
  /** Image baked from the assets directory (PNG or SVG), by file name. -1 when missing. */
  export function image(name: string): i32;
  export function imageWidth(image: i32): i32;
  export function imageHeight(image: i32): i32;
  export function drawImage(image: i32, x: number, y: number, w: number, h: number, alpha: i32, radius: number): void;
  export function clip(x: number, y: number, w: number, h: number): void;
  export function unclip(): void;
  /** Offset added to the coordinates of the following commands (reset every frame). */
  export function translate(x: number, y: number): void;
  /** Nothing changed this frame: present the previous one again (retained UIs call this when idle). */
  export function keep(): void;
  export function isDown(b: Btn): boolean;
  export function wasPressed(b: Btn): boolean;
  export function pointerX(): number;
  export function pointerY(): number;
  export function pointerDown(): boolean;
  /** Frame counter since start. */
  export function frame(): i32;
  export function quit(): void;
}
