// Arrays are covariant, as in TypeScript: records with more fields where records with fewer are expected (a new array of the
// copies, as one record is copied), and subclass objects where base class objects are expected (a new array of the same objects).
interface Song { title: string }
interface Big { title: string; extra: i32 }
const big: Big[] = [{ title: 'a', extra: 1 }, { title: 'b', extra: 2 }];
const one: Song = big[0];
const s: Song[] = big;
console.log(`${one.title} ${s.length} ${s[1].title}`);
function titles(xs: Song[]): string { let r = ''; for (const x of xs) r += x.title; return r; }
console.log(titles(big));

class Animal { name: string; constructor(name: string) { this.name = name; } speak(): string { return this.name; } }
class Dog extends Animal { speak(): string { return this.name + ' woofs'; } }
const dogs: Dog[] = [new Dog('rex'), new Dog('fido')];
const animals: Animal[] = dogs;
function names(xs: Animal[]): string { return xs.map((a: Animal) => a.speak()).join(', '); }
console.log(names(animals) + ' / ' + names(dogs));
animals[0].name = 'max';
console.log(dogs[0].name);
