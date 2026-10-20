// The typed side of RegExp (what differs from JavaScript on purpose): a result with the index, input and named groups is RegExp.match(), exec gives '' for a group
// that did not take part, matchAll is an array, a replace callback gets the match and the groups, and a string given to match or search is a pattern.
const date = /(?<y>\d{4})-(?<m>\d{2})(?:-(?<d>\d{2}))?/;
const m = date.match('on 2026-10 and later');
if (m !== null) console.log(m.index, m.input.length, m.captures, m.present, m.group('y'), m.group('m'), m.group('d') === '', m.get(1), m.groups.size);
console.log(date.match('nothing') === null, date.exec('x 2026-10-07 y'));
console.log('a1b2'.matchAll(/[a-z](\d)/g).length, 'a1b2'.match('\\d'), 'a1b2'.search('b'));
console.log('x-y'.replace(/(\w)-(\w)/, (all: string, a: string, b: string) => b + '-' + a + '/' + all));
const re = new RegExp('a(b)?', 'g');
console.log(re.flags, re.lastIndex, re.test('ab a'), re.lastIndex, re.test('ab a'), re.lastIndex, re.test('ab a'), re.lastIndex, re.toString());
try { 'x'.replaceAll(/x/, 'y'); } catch (e) { console.log((e as Error).name, (e as Error).message); }
try { new RegExp('(?<n>a)(?<n>b)'); } catch (e) { console.log((e as Error).name); }
try { /(a*)*b/.test('a'.repeat(5000) + 'c'); console.log('no throw'); } catch (e) { console.log((e as Error).name); }
console.log(/\bé/u.test('é'), /^\p{Lu}\p{Ll}+$/u.test('Éric'), 'İ'.match(/i/i) === null);
