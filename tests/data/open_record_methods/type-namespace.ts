type Shape = { name: string };
function makeMap(): Map<string, number> { return new Map<string, number>(); }
function makeSet(): Set<number> { return new Set<number>(); }
function names(): void {
  const unknown = 1, any = 2, never = 3, undefined = 4, Map = 5, Set = 6, Partial = 7;
  type Value = typeof Shape;
  let Shape = 8;
  function outer(): void { function read(value?: unknown): void {} read(); }
  function dynamic(value: any): void { console.log(typeof value); }
  function impossible(): never { throw new Error('never'); }
  function optional(value: string | undefined): string { return value ?? 'missing'; }
  const map: Map<string, number> = makeMap(); map.set('key', 9);
  const set: Set<number> = makeSet(); set.add(10);
  const partial: Partial<Shape> = {};
  const shape: Shape = { name: 'shape' };
  const value: Value = 11;
  outer(); dynamic(12);
  console.log(unknown, any, never, undefined, Map, Set, Partial, Shape);
  console.log(optional('present'), map.get('key'), set.has(10), JSON.stringify(partial), shape.name, value);
}
function generic<T>(value: T): T {
  const T = 99;
  function nested(value: T): T { return value; }
  return nested(value);
}
function builtinParameter<Map>(value: Map): Map { return value; }
names(); console.log(generic<string>('generic'), builtinParameter<string>('parameter'));
