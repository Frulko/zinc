// Imported by strip.ts: the names it reads only in types leave the import (an interface or an alias is no export at run time)
export interface Shape2 { area(): number }
export type Id = number;
export class Box implements Shape2 { constructor(public w: number) {} area(): number { return this.w * this.w; } }
