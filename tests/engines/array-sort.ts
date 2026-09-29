const numbers: i32[] = [8, 3, 5, 3, -1, 0];
console.log('numbers', numbers.sort((a, b) => a - b) === numbers, numbers.join(','));
interface Item { order: i32; label: string }
const objects: Item[] = [{order:2,label:'a'},{order:1,label:'b'},{order:2,label:'c'},{order:1,label:'d'}];
objects.sort((a, b) => a.order - b.order);
console.log('stable', objects.map(x => x.label).join(','));
console.log('nan', [3, 2, 1].sort(() => 0 / 0).join(','));
const empty: i32[] = []; empty.sort((a,b): number => { throw new Error('empty comparator'); });
const one: i32[] = [7]; one.sort((a,b): number => { throw new Error('single comparator'); });
console.log('small', empty.length, one[0]);
let changed = false;
const growing: i32[] = [3, 1, 2];
growing.sort((a,b) => { if (!changed) { changed = true; growing[0] = 50; growing.push(99); } return a-b; });
console.log('growing', growing.join(','));
changed = false;
const shrinking: i32[] = [4, 3, 2, 1];
shrinking.sort((a,b) => { if (!changed) { changed = true; while(shrinking.length) shrinking.pop(); } return a-b; });
console.log('shrinking', shrinking.join(','));
const aborted: i32[] = [3, 2, 1];
let calls: i32 = 0;
try { aborted.sort((a,b): number => { calls++; aborted[0] = 7; throw new Error('compare'); }); }
catch (error) { console.log('caught', error.message, calls, aborted.join(',')); }
let reentrant = false;
const nested: i32[] = [5, 1, 4, 2, 3];
nested.sort((a,b) => { if (!reentrant) { reentrant = true; nested.sort((x,y) => y-x); } return a-b; });
console.log('nested', nested.join(','));
const retained: Item[] = [{order:3,label:'three'},{order:1,label:'one'},{order:2,label:'two'}];
let cleared = false;
retained.sort((a,b) => {
  if (!cleared) { cleared = true; while(retained.length) retained.pop(); }
  for (let i: i32 = 0; i < 1000; i++) { const garbage: Item = {order:i,label:'garbage'}; }
  return a.order - b.order;
});
console.log('gc', retained.map(x => x.label).join(','));
