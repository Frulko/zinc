// Reads both.ts for its type before main.ts imports it as a value: both.ts runs once, when main.ts reaches it
import type { Pair } from './both';
export function show(p: Pair): string { return `${p.a}/${p.b}`; }
