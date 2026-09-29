class Gauge {
  raw: i32 = 1;
  get value(): i32 { if (this.raw < 0) throw new Error('invalid raw'); return this.raw * 2; }
  set value(value: i32) { if (value < 0) throw new Error('negative'); this.raw = value / 2; }
  callback(): (value: i32) => i32 { return (value: i32): i32 => { this.value = value; return this.value; }; }
}
class FancyGauge extends Gauge {
  get value(): i32 { return this.raw * 3; }
  set value(value: i32) { this.raw = value / 3; }
}
const gauge = new Gauge();
console.log('get', gauge.value);
gauge.value = 12;
console.log('set', gauge.value, gauge.raw);
try { gauge.value = -1; } catch (e) { console.log('caught', e.message); }
const derived: Gauge = new FancyGauge();
derived.value = 15;
console.log('virtual', derived.value, derived.raw);
const callback = gauge.callback();
console.log('capture', callback(20), gauge.raw);
let sum: i32 = 0;
for (let i: i32 = 0; i < 1000; i++) {
  const local = new Gauge();
  const saved = local.callback();
  const junk: string[] = ['alloc ' + i, 'noise ' + i];
  sum += saved(i * 2) + junk.length;
}
console.log('gc', sum, callback(30));
let receiverCalls: i32 = 0;
function receiver(): Gauge { receiverCalls++; return gauge; }
console.log('assignment', receiver().value = 44, receiverCalls, gauge.value);
function badRead(): i32 { gauge.raw = -1; return gauge.value; }
try { console.log(badRead()); } catch (e) { console.log('getter caught', e.message); }
function badWrite(): void { gauge.value = -2; }
try { badWrite(); } catch (e) { console.log('setter caught', e.message); }
class SetterFirst {
  raw: i32 = 0;
  set value(v: i32) { this.raw = v; }
  get value(): i32 { return this.raw; }
}
const setterFirst = new SetterFirst();
setterFirst.value = 9;
console.log('setter first', setterFirst.value);
