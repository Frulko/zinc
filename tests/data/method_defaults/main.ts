import { equal, ok } from 'zinc:assert';
let events = '';
class Buffer {
  lines: string[];
  constructor(lines: string[]) { this.lines = lines; }
  text(last: number = this.lines.length - 1): string { return this.lines[last]; }
  last(): number { events += 'default;'; return this.lines.length - 1; }
  choose(last: number = this.last(), suffix: string = '!'): string { events += 'body;'; return this.lines[last] + suffix; }
  combine(other: Buffer, length: number = other.text().length + this.lines.length): number { return length + this.lines.length; }
  callback(read: () => string = (): string => this.text()): string { return read(); }
  restore(other: Buffer): string { const text = other.text(); return this.text() + '/' + text; }
  fail(): number { throw new Error('default'); }
  throwing(last: number = this.fail()): string { return this.lines[last]; }
}
const a = new Buffer(['one', 'two']), b = new Buffer(['three']);
equal(a.text(), 'two'); equal(b.text(), 'three'); equal(a.text(0), 'one', 'explicit zero'); equal(a.text(undefined), 'two');
equal(a.callback(), 'two'); equal(b.callback(), 'three');
equal(a.combine(b), 9); equal(a.restore(b), 'two/three');
let calls = 0;
function receiver(): Buffer { calls++; events += 'receiver;'; return a; }
function suffix(): string { events += 'argument;'; return '?'; }
events = ''; equal(receiver().choose(undefined, suffix()), 'two?');
equal(calls, 1); equal(events, 'receiver;argument;default;body;');
events = ''; equal(receiver().choose(0, suffix()), 'one?'); equal(events, 'receiver;argument;body;');
const invoke = (): string => b.text(); equal(invoke(), 'three');
function shadow(undefined: number): string { return a.text(undefined); }
equal(shadow(0), 'one', 'shadowed undefined');
let threw = false;
try { a.throwing(); } catch (error) { threw = true; }
ok(threw); equal(b.text(), 'three');
class Base {
  lines: string[];
  constructor(lines: string[]) { this.lines = lines; }
  text(last: number = this.lines.length - 1): string { return 'base/' + this.lines[last]; }
  last(): number { events += 'default;'; return this.lines.length - 1; }
  choose(last: number = this.last(), ending: string = '!'): string { events += 'body;'; return 'base/' + this.lines[last] + ending; }
}
class Derived extends Base {
  override text(last: number = this.lines.length - 1): string { return 'derived/' + this.lines[last]; }
  override choose(last: number = this.last(), ending: string = '!'): string { events += 'body;'; return 'derived/' + this.lines[last] + ending; }
}
function virtualText(value: Base): string { return value.text(); }
function virtualUndefined(value: Base): string { return value.text(undefined); }
function virtualChoose(value: Base): string { return value.choose(undefined, suffix()); }
equal(virtualText(new Base(['a', 'b'])), 'base/b');
equal(virtualText(new Derived(['c', 'd', 'e'])), 'derived/e');
equal(virtualUndefined(new Derived(['f', 'g'])), 'derived/g');
events = ''; equal(virtualChoose(new Derived(['h', 'i'])), 'derived/i?'); equal(events, 'argument;default;body;');
class Link {
  next: Buffer | null;
  constructor(next: Buffer | null) { this.next = next; }
  length(n: number = this.next?.text().length ?? 0): number { return n; }
}
equal(new Link(a).length(), 3); equal(new Link(null).length(), 0); equal(new Link(b).length(), 5);
function ordinary(a: number = 2, b: number = a * 2): number { return a + b; }
equal(ordinary(), 6); equal(ordinary(0), 0); equal(ordinary(undefined, 9), 11);
console.log('method defaults: pass');
