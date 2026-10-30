// A module checked before the classes of the program that imports it (class_runtime.ts): the `any` view it makes of a Base must still be
// that of the object's own class, declared later, with its fields.
export class Base { x: number = 1; }
export function peek(o: Base): string {
  const d: any = o;
  const a: any = d.alpha;
  d.x = 3;
  return `${o.constructor.name} alpha ${a} x ${o.x}`;
}
