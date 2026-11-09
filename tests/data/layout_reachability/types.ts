export class UNUSED_LAYOUT_MARKER { unused: string = 'dead field'; }
export interface Label { label(): string; }
export class Base { value: i32; constructor(value: i32) { this.value = value; } }
export class Child extends Base implements Label {
  extra: i32 = 7;
  label(): string { return 'kept'; }
}
export interface Packet { count: i32; maybe: number | null; nested: { flag: boolean; name: string }; }
export function makePair(n: i32): Child[] { return [new Child(n), new Child(n + 1)]; }
export function joinOwned(a: string, b: string): string { return a + b; }
export function inlineNumber(n: i32): i32 { return n + 4; }
