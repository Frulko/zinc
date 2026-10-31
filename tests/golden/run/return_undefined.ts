// A function whose return type holds undefined may end without a value (TypeScript 5.1), as React's effect callbacks do: a void-annotated
// callback is accepted there, a bare return gives undefined (ZN-904).
function eff(fn: () => (() => void) | undefined): void {
  const r = fn();
  if (r !== undefined) r();
  else console.log('none');
}
function name(n: number): string | undefined {
  if (n > 0) return 'pos';
}
eff(() => { console.log('a'); });
eff((): (() => void) => { console.log('b'); return () => console.log('clean b'); });
eff(() => { console.log('c'); return () => console.log('clean c'); });
eff((): void => { console.log('d'); });
eff((): void => { if (name(1) !== undefined) return; console.log('never'); });
eff(() => { if (name(-1) === undefined) return; return () => console.log('never'); });
console.log(name(1), name(-1) === undefined);
