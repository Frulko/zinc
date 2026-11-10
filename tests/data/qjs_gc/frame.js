import { onFrame, clear, rect } from 'zinc:gfx';
const live = [];
for (let i = 0; i < 2000; i++) live.push({ i });
let turn = 0;
let garbage;
onFrame(() => {
  // Retain these until the next callback, then leave only their cycles behind.
  garbage = [];
  for (let i = 0; i < 40000; i++) { const x = { i }; x.self = x; garbage.push(x); }
  clear(0x101010);
  rect(++turn, 0, 2, 2, 0xffffff);
  if (turn === 6) console.log('frames', turn, live[123].i);
});
