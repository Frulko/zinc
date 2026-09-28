// Closures: a captured mutable variable lives in a shared cell, so every call of the closure sees the update.
import { section } from '../report';

/** Returns a function that counts its own calls. */
function makeCounter(): () => i32 {
  let calls: i32 = 0;
  return () => {
    calls++;
    return calls;
  };
}

export function closures(): void {
  section('Closures');
  const next = makeCounter();
  next();
  next();
  console.log('counter', next());

  // functions returning functions: each adder remembers its own `k`
  const adders = [1, 2, 3].map(k => (x: number) => x + k);
  console.log(adders.map(add => add(10)));
}
