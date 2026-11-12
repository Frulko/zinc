class R { value: number = 1; }
function probe(v: R | null): number {
 try { if (v !== null && ((v = null) === null)) {} else { v = new R(); } }
 catch (error) { return 0; }
 const bad: R = v;
 return bad.value;
}
console.log(probe(new R()));
