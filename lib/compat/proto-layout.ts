// zinc:__layout for the prototype toolchain (compiler/): Zinc Next has a host layout engine (Yoga) behind this module for the `rn` layout mode of
// lib/std/ui.ts; the prototype has the classic engine only (zinc:platform UI_LAYOUT is 'classic'), so nothing here is ever called. It exists so that
// lib/std/ui.ts, shared by both engines, still compiles with the prototype.
export function open(webDefaults: boolean): boolean { return false; }
export function create(n: i32): void {}
export function destroy(n: i32): void {}
export function style(n: i32, prop: i32, v: number): void {}
export function insert(parent: i32, child: i32, index: i32): void {}
export function remove(parent: i32, child: i32): void {}
export function text(n: i32, s: string, font: i32, size: i32, tracking: number, wordSpacing: number, whiteSpace: i32, wordBreak: i32, clamp: i32, flags: i32, lineHeight: number): void {}
export function image(n: i32, w: number, h: number): void {}
export function field(n: i32, rows: i32, lineHeight: number, fullWidth: boolean): void {}
export function clear(n: i32): void {}
export function dirty(n: i32): void {}
export function calculate(root: i32, w: number, h: number): void {}
export function x(n: i32): number { return 0; }
export function y(n: i32): number { return 0; }
export function width(n: i32): number { return 0; }
export function height(n: i32): number { return 0; }
export function lineCount(n: i32): i32 { return 0; }
export function line(n: i32, i: i32): string { return ''; }
export function lineWidth(n: i32, i: i32): number { return 0; }
export function counter(which: i32): number { return 0; }
