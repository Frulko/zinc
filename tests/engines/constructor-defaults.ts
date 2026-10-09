let calls: i32 = 0;
function initial(): i32[] { calls++; return [calls]; }
class Holder {
  values: i32[];
  label: string;
  constructor(values: i32[] = initial(), label: string = 'default') { this.values = values; this.label = label; }
}
const one = new Holder();
const two = new Holder(undefined, 'two');
const supplied: i32[] = [9];
const three = new Holder(supplied, undefined);
one.values.push(8);
console.log('defaults', calls, one.values.join(','), two.values.join(','), three.values.join(','), one.label, two.label, three.label);
