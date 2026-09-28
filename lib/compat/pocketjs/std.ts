// PocketJS compatibility (@pocketjs/framework/solid/std): integer helpers and timers.
import { after as uiAfter } from 'zinc:ui/solid';
export type i32 = number;
export function imod(a: i32, b: i32): i32 { return a % b; }
export function idiv(a: i32, b: i32): i32 { return Math.trunc(a / b); }
export function after(ms: i32): Promise<void> { return uiAfter(ms); }
