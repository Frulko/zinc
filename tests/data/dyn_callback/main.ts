class Box {
  visit(f: (value: unknown, name: string) => void): void { f('ok', 'key'); }
  result(f: () => unknown): unknown { return f(); }
  anyValue(f: (value: any) => any): any { return f('any'); }
}
const box: any = new Box();
box.visit((value: unknown, name: string): void => console.log(value, name));
console.log(box.result((): unknown => 'result'));
console.log(box.anyValue((value: any): any => value));
const callback: unknown = (value: unknown): unknown => value;
const restored = callback as (value: unknown) => unknown;
console.log(restored('roundtrip'));
const anyCallback: any = (value: any): any => value;
const anyRestored = anyCallback as (value: any) => any;
console.log(anyRestored('any-roundtrip'));
