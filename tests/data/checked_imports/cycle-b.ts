import type { A } from './cycle-a';
export interface B { count: number; a?: A; }
