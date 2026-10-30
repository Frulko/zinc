// a.ts and b.ts name each other's interfaces: a cycle of type-only imports, as a shared types file often has
import type { B } from './b.ts';
export interface A { name: string; next: B | null; }
