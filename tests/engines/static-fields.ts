let sequence: i32 = 0;
function mark(label: string): i32 { console.log('init', label, ++sequence); return sequence; }
class First {
  static number: i32 = mark('first');
  static label: string = 'retained';
  static values: i32[] = [4, 5];
  static object: { text: string } = { text: 'rooted' };
  static closure: (n: i32) => i32 = (n: i32): i32 => First.number + n;
  own: i32 = 11;
  static bump(): i32 { return ++First.number; }
}
console.log('between', First.number, sequence);
class Second {
  static number: i32 = mark('second');
  static snapshot: i32 = First.number;
}
console.log('distinct', First.bump(), Second.number, Second.snapshot, new First().own);
First.values.push(6);
First.label += '!';
console.log('fields', First.label, First.values.length, First.closure(3));
let sum: number = 0;
for (let n: i32 = 0; n < 5000; n++) {
  const discarded = { text: `discarded-${n}` };
  sum += discarded.text.length;
}
console.log('retained', First.label, First.object.text, First.values[2], First.closure(5), sum);
