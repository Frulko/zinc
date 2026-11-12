globalThis.__zincWeb.registerNative('ArrayProbe', {
  edit(b,i,u,d) { b.splice(0,b.length,255,0,2); i.splice(0,i.length,-2147483648); u.reverse(); d.push(-0,.25,-2.5); return new Int32Array([-2147483648,2147483647]); },
  clear(...arrays) { for (const a of arrays) a.length=0; return 'all empty'; },
  fail(b) { b[0]=1; throw Error('expected remote failure'); },
  alias(a,b) { a[0]=7; },
  doubles() { return [-0,.25,-2.5]; },
  voidValue() { const cyclic={}; cyclic.self=cyclic; return cyclic; }
}, []);
