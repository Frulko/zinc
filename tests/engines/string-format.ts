const infinity = parseFloat('Infinity'), nan = parseFloat('x');
console.log('fixed', (1.25).toFixed(1), (1.234).toFixed(2), (-0.0).toFixed(), (-0.0001).toFixed(2));
console.log('edge', (1e21).toFixed(2), infinity.toFixed(), nan.toFixed(), (0.1).toFixed(25));
console.log('digits', (1.25).toFixed(0), (1).toFixed(100).length);
console.log('replace', 'one two one'.replace('one', '1'), 'abc'.replace('x', 'y'), '😀x😀'.replace('😀', '🌍'));
console.log('empty', 'abc'.replace('', '-'), ''.replace('', '-'));
console.log('substitution', 'abc'.replace('b', "[$&]|$$|$`|$'|$1"));
console.log('unicode', 'é😀中'.replace('😀', '⭐'), 'foo'.replace('foo', ''));
let total: i32 = 0;
let saved = '';
for (let i: i32 = 0; i < 500; i++) {
  const text = (i / 3).toFixed(6).replace('.', ',');
  if (i === 0) saved = text;
  total += text.length;
}
console.log('gc', total, saved);
console.log('undefined digits', (1.25).toFixed(undefined));
