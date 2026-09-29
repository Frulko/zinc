const text = 'a😀éz';
console.log('length', text.length);
console.log('slice', text.slice(1, 3), text.slice(-2), text.substring(4, 1));
console.log('search', text.indexOf('é'), text.lastIndexOf('a'), text.includes('😀', 1), text.startsWith('é', 3), text.endsWith('é', 4));
console.log('case', ' ZINC '.trim().toLowerCase(), 'zinc'.toUpperCase(), text.charAt(3));
console.log('bounds', text.slice(99) === '', text.substring(-4, 1), text.charAt(99) === '', text.indexOf('missing'));
let saved = '';
let total: i32 = 0;
for (let i: i32 = 0; i < 10000; i++) {
  const value = ('  item-' + i + '😀  ').trim();
  total += value.length;
  if (i === 7) saved = value;
}
console.log('collected', total, saved);
