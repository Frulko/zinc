// A module with state and an initialisation side effect.
console.log('init counter');
export let count: i32 = 0;
export function bump(): i32 {
  count += 1;
  return count;
}
export class Box {
  constructor(public v: i32) {}
  twice(): i32 { return this.v * 2; }
  static pick<T>(a: T, b: T, first: boolean): T { return first ? a : b; }   // a static generic method, called from other modules
}
export interface Named { label(): string; }
export type Pair = [i32, i32];
