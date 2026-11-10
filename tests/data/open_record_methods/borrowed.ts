import { BorrowSource as Source, setLabel } from './borrowed-scope';
class Inherited extends Source {}
class Override extends Source { greet(prefix: string = 'override:'): string { return prefix + this.name; } }
const source: any = new Source();
const inherited: any = new Inherited();
const override: any = new Override();
const target: any = { name: 'target', greet: source.greet, defaults: source.defaults, rename: source.rename, arrow: source.arrow, nested: source.nested, optional: source.optional, fail: source.fail };
console.log(source.greet === inherited.greet, source.greet === override.greet, target.greet === source.greet);
console.log(target.greet(), target.greet('explicit:'));
setLabel('changed'); console.log(target.greet());
console.log(target.defaults(), target.defaults('first'), target.defaults('a','b'));
console.log(target.arrow(), target.nested());
console.log(target.rename('renamed'), target.name, source.name);
console.log(target.optional(), target.optional(undefined), target.optional(null));
try { target.fail(); } catch(e) { console.log(e.message); }
const extracted: any = target.greet;
try { extracted(); } catch(e) { console.log('unbound', e instanceof TypeError); }
const plain: any = { name: 'plain', greet: inherited.greet };
console.log(plain.greet(), source.greet());
let count = 0;
function receiver(): any { count++; return target; }
const key = 'greet'; console.log(receiver()[key]('once:'), count);
let order = '';
function first(): string { order += 'a'; return 'a'; }
function second(): string { order += 'b'; return 'b'; }
console.log(target.defaults(first(),second()), order);

class Named { name = 'typed'; constructor(public greet: any, public rename: any) {} }
const named = new Named(source.greet, source.rename); const dynamicNamed: any = named;
console.log(dynamicNamed.greet(), dynamicNamed.rename('shared'), named.name, source.name);

// Home-class/private/getter cases retain their checked existing path.
class ArrayOwner { values: number[] = [1]; append(): number { this.values.push(2); return this.values.length; } }
const arrayOwner = new ArrayOwner(); console.log((arrayOwner as any).append(), arrayOwner.values.length);
class Private { private name = 'private'; read(): string { return this.name; } }
class Getter { get name(): string { return 'getter'; } read(): string { return this.name; } }
class Base { name = 'base'; read(): string { return this.name; } }
class Super extends Base { read(): string { return super.read(); } }
console.log((new Private() as any).read(), (new Getter() as any).read(), (new Super() as any).read());
