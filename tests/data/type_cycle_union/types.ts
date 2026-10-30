// a module loaded as a value whose types name a module that imports its values: an interface, an enum and an alias across the cycle
import type { Track } from './track.ts';
export interface Album { title: string; tracks: Track[]; }
export enum Kind { Single, LP }
export type Shelf = Album[];
