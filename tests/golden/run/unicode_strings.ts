// Code points, case mapping, normalization and collation against the answers of Node (full ICU): the outputs are JSON of code point lists, so nothing depends on how a
// terminal draws them.
const out: string[] = [];
function show(label: string, v: unknown): void { out.push(label + ' ' + JSON.stringify(v)); }
function cps(s: string): number[] {
  const r: number[] = [];
  for (let i = 0; i < s.length; i++) {
    const c = s.codePointAt(i) as number;
    r.push(c);
    if (c > 0xffff) i++;
  }
  return r;
}
const family = '👨‍👩‍👧‍👦';
const flag = '🇫🇷';
const accents = 'éạ̈';
show('length', [family.length, flag.length, accents.length, 'a😀é'.length]);
const forOf: string[] = [];
for (const c of 'a😀é' + flag) forOf.push(c);
show('for-of', forOf.map((c) => cps(c)));
show('spread', [...family].map((c) => cps(c)));
show('Array.from', Array.from('x\u{1F600}y').map((c) => cps(c)));
show('codePointAt', [cps('😀'), '😀'.codePointAt(1), '😀'.codePointAt(0)]);
show('fromCodePoint', [cps(String.fromCodePoint(0x1F600)), cps(String.fromCodePoint(0x41)), cps(String.fromCodePoint(0xE9))]);

show('upper', ['Straße ŉ ǰ ΐ ǆ ﬁ ß ὒ', 'ǅ ǈ ǋ', 'ıi', 'ꭰ', 'abcé'].map((s) => cps(s.toUpperCase())));
show('lower', ['İSTANBUL', 'ΑΣ ΑΣΑ Σ ΑΣ.', 'Σ', 'ΑΣ Σ', 'ǅ', 'ẞ', 'ꭰ', 'ΧΑΟΣ ΧΑΟΣΣ'].map((s) => cps(s.toLowerCase())));
show('case ascii', ['Hello World'.toUpperCase(), 'Hello World'.toLowerCase()]);

show('NFC', [cps('é'.normalize('NFC')), cps('é'.normalize('NFC')), cps('각'.normalize('NFC')), cps('Å'.normalize('NFC'))]);
show('NFD', [cps('é'.normalize('NFD')), cps('각'.normalize('NFD')), cps('ẛ̣'.normalize('NFD'))]);
show('NFKC', [cps('ﬁ'.normalize('NFKC')), cps('①'.normalize('NFKC')), cps('ẛ̣'.normalize('NFKC')), cps('ｱ'.normalize('NFKC'))]);
show('NFKD', [cps('ﬁ'.normalize('NFKD')), cps('ẛ̣'.normalize('NFKD'))]);
show('normalize default', [cps('é'.normalize()), 'é'.normalize() === 'é']);

const words = ['banana', 'Apple', 'apple', 'cherry', 'Banana', 'äpfel', 'zebra', 'Zebra', 'éclair', 'eclair', 'resume', 'résumé', 'resumé', 'a', 'A', 'b', '10', '9', '1', '_x', '-x', ' x', 'x y', 'xy', 'x-y', 'Ωmega', 'alpha', 'ß', 'ss', 'strasse', 'straße'];
show('sorted', words.slice().sort((a, b) => a.localeCompare(b)));
show('pairs', [['a', 'b'], ['b', 'a'], ['a', 'a'], ['a', 'A'], ['A', 'a'], ['a', 'B'], ['é', 'f'], ['e', 'é'], ['é', 'e'], ['résumé', 'resume'], ['x', '_'], ['1', 'a'], ['', 'a']].map((p) => p[0].localeCompare(p[1])));
for (const line of out) console.log(line);
