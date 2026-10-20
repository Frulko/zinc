// Tagged templates (ZN-160): the tag gets the cooked strings and the values; String.raw keeps the escapes as written.
function tag(s: TemplateStringsArray, v: number): string { return s[0] + '|' + v + '|' + s[1]; }
console.log(tag`a${1}b`);

function shout(strings: TemplateStringsArray, ...values: string[]): string {
  let out = '';
  for (let i = 0; i < strings.length; i++) {
    out += strings[i];
    if (i < values.length) out += values[i].toUpperCase();
  }
  return out;
}
const who = 'world', what = 'zinc';
console.log(shout`hello ${who}, this is ${what}!`);
console.log(shout`no values`);
console.log(shout`${who}${what}`);

function count(strings: TemplateStringsArray, ...values: number[]): string {
  return strings.length + ' strings, ' + values.length + ' values, first "' + strings[0] + '"';
}
console.log(count`tab\there ${1} and ${2}`);

const path = String.raw`C:\new\table${1 + 1}\x`;
console.log(path, path.length);
console.log(String.raw`a\nb`, String.raw`\``, String.raw`plain`);

class Fmt { static money(s: TemplateStringsArray, n: number): string { return s[0] + n.toFixed(2) + s[1]; } }
console.log(Fmt.money`total: ${12.5} EUR`);
