import type { Album, Shelf } from './types.ts';
import { Kind } from './types.ts';
import type { Opts } from './main.ts';
export interface Named { title: string; }
export interface Track extends Named { album: Album | null; kind: Kind; }
export function count(s: Shelf): number { let n = 0; for (const a of s) n += a.tracks.length; return n; }
export function run(o: Opts): string { return o.label + ':' + o.n; }
