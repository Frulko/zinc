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
  /** 8x8 debug font, scaled by `scale`. */
  export function text(x: number, y: number, s: string, color: u32, scale: i32): void;
  export function isDown(b: Btn): boolean;
  export function wasPressed(b: Btn): boolean;
  export function pointerX(): number;
  export function pointerY(): number;
  export function pointerDown(): boolean;
  /** Frame counter since start. */
  export function frame(): i32;
  export function quit(): void;
}
