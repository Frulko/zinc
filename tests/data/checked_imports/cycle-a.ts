import type { B } from './cycle-b';
export interface A { title: string; b?: B; }
