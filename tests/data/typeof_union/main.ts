import { equal } from 'zinc:assert';

interface Example { size?: string | number }
function report(p: Example, expected: string, size: number): void {
  equal(typeof p.size, expected, 'optional record field');
  equal(typeof p.size === 'number' ? p.size as number : 40, size, 'numeric branch');
}
report({ size: 56 }, 'number', 56);
report({ size: 0 }, 'number', 0);
report({ size: 1.5 }, 'number', 1.5);
report({ size: 'large' }, 'string', 40);
report({}, 'undefined', 40);
report({ size: undefined }, 'undefined', 40);

function mixed(v: string | number): string { return typeof v; }
equal(mixed(56), 'number'); equal(mixed('large'), 'string');
function nullable(v: string | number | null): string { return typeof v; }
equal(nullable(56), 'number'); equal(nullable('large'), 'string'); equal(nullable(null), 'object');
function optional(v: number | undefined): string { return typeof v; }
equal(optional(56), 'number'); equal(optional(undefined), 'undefined');
function integer(v: i32): string { return typeof v; }
function real(v: f64): string { return typeof v; }
equal(integer(56), 'number'); equal(real(1.5), 'number');

let calls: i32 = 0;
function value(): string | number | undefined { calls++; return 56; }
equal(typeof value(), 'number'); equal(calls, 1, 'one call');
class Getter {
  reads: i32 = 0;
  get size(): string | number | undefined { this.reads++; return 'large'; }
}
const getter = new Getter();
function receiver(): Getter { calls++; return getter; }
equal(typeof receiver().size, 'string');
equal(calls, 2, 'one receiver evaluation'); equal(getter.reads, 1, 'one getter evaluation');
console.log('typeof union: pass');
