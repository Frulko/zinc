import { onChange } from 'zinc:power';
let first = 0;
let removed = 0;
let restarted = 0;
let stopFirst: () => void = () => {};
let stopOther: () => void = () => {};
let stopRestart: () => void = () => {};
stopFirst = onChange(() => {
  first++;
  stopOther(); stopFirst(); stopFirst();
  stopRestart = onChange(() => { restarted++; stopRestart(); });
  throw new Error('expected-listener-error');
});
stopOther = onChange(() => { removed++; });
setTimeout(() => { console.log('events', first, removed, restarted); stopFirst(); stopOther(); stopRestart(); }, 5200);
