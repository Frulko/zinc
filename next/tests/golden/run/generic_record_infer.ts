// A generic function whose parameter is a record of the template (a generic component's props) infers its type argument from the fields of an object
// literal: from an array field, from the parameter of a function field, and through a generic record nested in it.
type Info<T> = { item: T; index: number };
type Props<T> = { data: T[]; render: (info: Info<T>) => string; sep?: string };
function list<T>(p: Props<T>): string {
  let s = '';
  for (let i = 0; i < p.data.length; i++) s += (i > 0 ? p.sep ?? ',' : '') + p.render({ item: p.data[i], index: i });
  return s;
}
class Row { name: string; constructor(n: string) { this.name = n; } }
console.log(list({ data: [new Row('a'), new Row('b')], render: (x: Info<Row>): string => x.item.name + x.index }));
console.log(list({ data: ['x', 'y', 'z'], render: (x: Info<string>): string => x.item.toUpperCase(), sep: ' ' }));
