function fail(n: i32): i32 { if (n > 0) throw new Error('failed'); return n; }
function catches(): i32 {
  let value: i32 = 1;
  try {
    value = 4;
    value = fail(1);
  } catch (e) {
    console.log(e.name, e.message, value);
    value += 2;
  } finally { value += 3; }
  return value;
}
console.log(catches());
function nested(): i32 {
  try {
    try { throw new TypeError('inner'); }
    finally { console.log('inner finally'); }
  } catch (e) { console.log(e.name, e.message); return 8; }
}
console.log(nested());
function returning(): i32 { try { return 3; } finally { console.log('return finally'); } }
console.log(returning());
function breaks(): i32 {
  let result: i32 = 0;
  for (let i: i32 = 0; i < 4; i++) {
    try { if (i === 1) continue; if (i === 2) break; result += 10; }
    finally { result += 1; }
  }
  return result;
}
console.log(breaks());
function rethrows(): string {
  try {
    try { fail(1); }
    catch (e) { console.log('rethrow', e.message); throw e; }
  } catch (e) { return e.message; }
  return 'unreachable';
}
console.log(rethrows());
function collectingFinally(): string {
  try {
    try { throw new Error('survived collection'); }
    finally {
      for (let i: i32 = 0; i < 20000; i++) {
        const message = `cleanup:${i}`;
        if (i === 19999) console.log(message);
      }
    }
  } catch (e) { return e.message; }
  return 'unreachable';
}
console.log(collectingFinally());
