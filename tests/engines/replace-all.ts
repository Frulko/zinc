function units(text: string): string {
  const out: i32[] = [];
  for (let i: i32 = 0; i < text.length; i++) out.push(text.charCodeAt(i));
  return out.join(',');
}
console.log('all', 'one one one'.replaceAll('one', '1'), 'abc'.replaceAll('x', 'y'));
console.log('empty', 'ab'.replaceAll('', '-'), ''.replaceAll('', '-'), 'ab'.replaceAll('', ''));
console.log('substitution', 'ababa'.replaceAll('b', "[$&]|$$|$`|$'|$1"));
console.log('unicode', '😀x😀é'.replaceAll('😀', '🌍'));
console.log('utf16 empty', units('😀'.replaceAll('', '-')));
console.log('utf16 prefix', units('😀'.replaceAll('', '$`')));
console.log('utf16 suffix', units('😀'.replaceAll('', "$'")));
console.log('utf16 identity', '😀'.replaceAll('', '') === '😀', units('😀'.replaceAll('', '$&')));
const high = '😀'.slice(0, 1), low = '😀'.slice(1);
console.log('isolated', units(high.replaceAll('', '-')), units(low.replaceAll('', '-')));
console.log('nonoverlap', 'aaaa'.replaceAll('aa', 'b'), 'aaa'.replaceAll('aa', 'b'));
let sum: i32 = 0;
let saved = '';
for (let i: i32 = 0; i < 500; i++) {
  const value = ('😀' + i).replaceAll('', '-');
  if (i === 0) saved = value;
  sum += value.length;
}
console.log('gc', sum, units(saved));
console.log('from code', String.fromCharCode(90), units(String.fromCharCode(-1)), units(String.fromCharCode(65536)), units(String.fromCharCode(4294967296)));
console.log('from surrogate', units(String.fromCharCode(55357)), units(String.fromCharCode(56832)), String.fromCharCode(55357).concat(String.fromCharCode(56832)) === '😀');
