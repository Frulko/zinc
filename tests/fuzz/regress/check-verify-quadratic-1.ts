// Regular expressions against the answers of a JavaScript engine (Node): the outputs are JSON, so the typed deviations (no `undefined` in exec results) do not show.
const out: string[] = [];
function show(label: string, v: unknown): void { out.push(label + ' ' + JSON.stringify(v)); }
function ex(re: RegExp, s: string): string[] | null { return re.exec(s); }

show('digits', ex(/(\d+)-(\d+)/, 'a 12-34 b'));
show('no match', ex(/z/, 'abc'));
show('anchors', [/^abc$/.test('abc'), /^abc$/.test('abcd'), /^b/m.test('a\nb'), /^b/.test('a\nb')]);
show('dot', [/a.c/.test('a\nc'), /a.c/s.test('a\nc'), /a.c/.test('abc')]);
show('classes', ex(/[a-f0-9]+/i, 'xx BEEF42 yy'));
show('quant', [ex(/a{2,3}/, 'aaaa'), ex(/a+?/, 'aaa'), ex(/a*?b/, 'aaab'), ex(/(ab)*c/, 'ababc')]);
show('alternation', ex(/cat|dog|bird/, 'my dog barks'));
show('backref', [ex(/(\w)\1/, 'hello'), ex(/(?<q>['"]).*?\k<q>/, 'say "hi" now')]);
show('lookahead', [ex(/a(?=b)/, 'ac ab'), ex(/a(?!b)/, 'ab ac'), 'ab ac'.search(/a(?!b)/)]);
show('lookbehind', [ex(/(?<=\$)\d+/, 'cost $42'), ex(/(?<!\$)\b\d+/, '$42 17')]);
show('case', [/straße/i.test('STRASSE'), /é/i.test('É'), /[a-z]+/i.test('ABC')]);
show('unicode', [/\u{1F600}/u.test('😀'), /^.$/u.test('😀'), /^.$/.test('😀'), ex(/\p{L}+/u, '123 héllo wörld'), ex(/\p{Lu}/u, 'abcDef')]);
show('word', ex(/\bfoo\b/, 'a foo b'));
show('groups', ex(/(a)|(b)/, 'b'));
show('nested', ex(/((a)(b))+/, 'abab'));
show('escape', [ex(/\./, 'a.b'), ex(/[\]]/, 'a]b'), ex(/\//, 'a/b'), ex(/\t/, 'a\tb')]);

// replace
show('replace first', 'aaa'.replace(/a/, 'b'));
show('replace global', 'aaa'.replace(/a/g, 'b'));
show('replace $', ['abc'.replace(/(b)/, '[$1]'), 'abc'.replace(/b/, '[$&]'), 'abc'.replace(/b/, '[$`]'), 'abc'.replace(/b/, "[$']"), 'abc'.replace(/b/, '[$$]'), 'abc'.replace(/(b)/, '$2'), 'abc'.replace(/(b)/, '$01'), 'abc'.replace(/(?<x>b)/, '<$<x>>')]);
show('replace fn', 'a1b22'.replace(/\d+/g, (m: string) => '(' + m.length + ')'));
show('replace fn groups', '2020-01-02'.replace(/(\d+)-(\d+)-(\d+)/, (m: string, y: string, mo: string, d: string) => d + '.' + mo + '.' + y));
show('replace empty', ['abc'.replace(/x*/g, '-'), 'abc'.replace(/(?:)/g, '.'), '😀'.replace(/(?:)/gu, '.'), '😀'.replace(/(?:)/g, '.').length]);
show('replaceAll', ['a.b.c'.replaceAll(/\./g, '/'), 'aXbxc'.replaceAll(/x/gi, '-')]);
show('trim', ['  a b  '.replace(/^\s+|\s+$/g, ''), 'a  b   c'.replace(/\s+/g, ' ')]);
show('camel', 'foo-bar-baz'.replace(/-(\w)/g, (m: string, c: string) => c.toUpperCase()));

// split
show('split', ['a, b;c'.split(/[,;]\s*/), 'abc'.split(/(?:)/), 'a1b2c'.split(/(\d)/), 'a1b2c'.split(/\d/, 2), ''.split(/x/), ''.split(/(?:)/), 'abc'.split(/b/), 'abc'.split(/$/), 'a b  c'.split(/\s*/)]);
show('split limit', ['a,b,c'.split(/,/, 0), 'a,b,c'.split(/,/, 1), 'a,b,c'.split(/(,)/, 3)]);

// match / matchAll / search
show('match', ['xaxbx'.match(/x/g), 'abc'.match(/z/g), 'abc'.match(/z/), 'a1b2'.match(/\d/g)]);
show('matchAll', Array.from('a1b22c333'.matchAll(/(\d)(\d*)/g)));
show('search', ['abc'.search(/c/), 'abc'.search(/z/), 'abc'.search('b')]);

// lastIndex, g and y
const g = /a/g;
const lis: number[] = [];
let m = g.exec('aaba');
while (m !== null) { lis.push(g.lastIndex); m = g.exec('aaba'); }
show('lastIndex global', lis);
const y = /a/y;
y.lastIndex = 1;
show('sticky', [y.test('ba'), y.lastIndex, y.test('ba'), y.lastIndex]);
const g2 = /b/g;
g2.lastIndex = 5;
show('lastIndex beyond', [g2.test('abc'), g2.lastIndex]);

// flags and source
show('flags', [/a/gimsuy.flags, new RegExp('a', 'yg').flags, /a/g.global, /a/i.ignoreCase, /a/m.multiline, /a/s.dotAll, /a/u.unicode, /a/y.sticky, new RegExp('a/b').test('a/b')]);
show('toString', [/a+b/gi.toString(), new RegExp('x', 'm').toString()]);
show('constructor', new RegExp('\\d+').test('a1'));
try { new RegExp('['); show('bad pattern', 'accepted'); } catch (e) { show('bad pattern', (e as Error).name); }
try { new RegExp('a', 'gg'); show('bad flags', 'accepted'); } catch (e) { show('bad flags', (e as Error).name); }

for (const line of out) console.log(line);
