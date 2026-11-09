// A local `let cur` of one function does not stop the narrowing of the top-level `cur` in the others, and a function above the
// top-level declaration narrows it too (its reads carry the dead-zone check) (ZN-798)
class Play { name: string = 'p'; out: number = 0; constructor(n: string) { this.name = n; } }
function words(s: string): string[] {
  const tokens: string[] = [];
  let cur = '';
  for (const ch of s) {
    if (ch === ' ') { if (cur !== '') { tokens.push(cur); cur = ''; } }
    else cur += ch;
  }
  if (cur !== '') tokens.push(cur);
  return tokens;
}
function early(): string { if (cur !== null) return cur.name; return 'none'; }
let cur: Play | null = null, closing = false;
function close(): void {
  if (cur === null || closing) return;
  cur.out = 1;
}
function show(): string { if (cur !== null) return cur.name + cur.out; return 'none'; }
console.log(early(), show());
cur = new Play('x');
close();
console.log(early(), show(), words('a bc d').join('|'));
