// Labeled statements (ZN-160): break and continue to a label, on every loop kind, a labeled block, through a switch and a finally.
outer: for (let i = 0; i < 3; i++) {
  for (let j = 0; j < 3; j++) {
    if (j === 1) continue outer;
    if (i === 2) break outer;
    console.log('for', i, j);
  }
}

block: {
  console.log('block start');
  if (Math.sqrt(4) === 2) break block;
  console.log('never printed');
}
console.log('after block');

let n = 0;
loop: while (true) {
  n++;
  do {
    if (n < 3) continue loop;
    break loop;
  } while (false);
}
console.log('while', n);

const words = ['a', 'bb', 'ccc', 'dddd'];
let found = '';
search: for (const w of words) {
  switch (w.length) {
    case 1: continue search;
    case 3: found = w; break search;
    default: break;
  }
  console.log('checked', w);
}
console.log('found', found);

function firstPair(xs: number[], target: number): string {
  let res = 'none';
  scan: for (let i = 0; i < xs.length; i++) {
    for (let j = i + 1; j < xs.length; j++) {
      try {
        if (xs[i] + xs[j] === target) { res = i + '+' + j; break scan; }
      } finally {
        if (xs[i] + xs[j] === target) console.log('finally on the way out');
      }
    }
  }
  return res;
}
console.log(firstPair([1, 4, 6, 9], 10));

function endless(): number {
  let k = 0;
  a: b: for (;;) {   // two labels on one loop (QuickJS-ng finds only the inner one for `continue`)
    k++;
    if (k < 5) continue b;
    if (k === 6) break a;
    if (k < 9) continue b;
    return k;
  }
  return -k;
}
console.log('endless', endless());
