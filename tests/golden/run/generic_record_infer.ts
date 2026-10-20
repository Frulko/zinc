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
// a record of the template holding an array of another generic record (SectionList's props): not emitted as a class while T is unbound
type SectionProps<T> = { sections: { title: string; data: T[] }[]; render: (item: T) => string };   // the section written in line: its instance is the literal's record
function sections<T>(p: SectionProps<T>): string {
  let s = '';
  for (const sec of p.sections) { s += sec.title + ':'; for (const d of sec.data) s += p.render(d); s += ' '; }
  return s;
}
console.log(sections({ sections: [{ title: 'A', data: [1, 2] }, { title: 'B', data: [3] }], render: (n: number): string => `${n}` }));
// the same through a generic alias of the section (an annotation and a literal of one shape are one record)
type Sec<T> = { title: string; data: T[] };
type SecProps<T> = { sections: Sec<T>[]; render: (item: T, s: Sec<T>) => string };
function walk<T>(p: SecProps<T>): string { let s = ''; for (const sec of p.sections) for (const d of sec.data) s += p.render(d, sec); return s; }
console.log(walk({ sections: [{ title: 'A', data: [1, 2] }, { title: 'B', data: [3] }], render: (n: number, s: Sec<number>): string => s.title + n }));
