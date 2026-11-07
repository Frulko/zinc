// chat-10m: a chat of 10 million messages in one VirtualList of rows of their own heights (bench, not a demo).
// The messages live in two columns (author, minute); a message's words come from its index, as in the reference video.
// CHAT_COUNT=n changes the count. CHAT_SCROLL=1 or up scrolls on its own, 6 px a frame, with a jump at the start and every 2 s (CPU while
// scrolling); CHAT_SCROLL=jump makes only the first jump, for a ZINC_INPUT gesture (docs/reports/zinc-next-perf.md, 2026-11-07).
import { render, VirtualList, createNodeRef } from 'zinc:ui/solid';
import { env } from 'zinc:sys';
import * as ui from 'zinc:ui';

const N: i32 = env('CHAT_COUNT') !== '' ? parseInt(env('CHAT_COUNT')) : 10000000;
const WORDS = ['the', 'build', 'patch', 'linux', 'windows', 'review', 'ok', 'works', 'green', 'lunch', 'thanks', 'before', 'again',
  'someone', 'tomorrow', 'you', 'see', 'my', 'is', 'can', 'not', 'on', 'that', 'but'];
const COLORS: number[] = [0x5b8def, 0xe0794c, 0x4caf7d, 0xd9b13b, 0xa46be0, 0x47b8c6, 0xd85a7f, 0x8a9a5b, 0xc27c4f, 0x6f7fd8];

const author: u8[] = [], minute: i32[] = [];
let seed = 12345;
const rnd = (): i32 => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed; };
let t = 0;
for (let i = 0; i < N; i++) { author.push((rnd() % 10) as u8); t += rnd() % 3; minute.push(t); }

function hash(i: i32): i32 { let h = (i * 2654435761) | 0; h ^= h >>> 15; h = (h * 2246822519) | 0; h ^= h >>> 13; return h & 0x7fffffff; }
function words(i: i32): string {
  let h = hash(i), n = 2 + h % 7;
  if (h % 11 === 0) n += 40;   // a long message wraps to several lines
  const out: string[] = [];
  for (let k = 0; k < n; k++) { h = hash(h + k); out.push(WORDS[h % WORDS.length]); }
  return out.join(' ');
}
function clock(m: i32): string { const h = Math.floor(m / 60) % 24, mm = m % 60; return `${h < 10 ? '0' : ''}${h}:${mm < 10 ? '0' : ''}${mm}`; }

function Row(p: { i: i32 }) {
  const a = author[p.i];
  return <View className="flex-row px-4 py-1.5 gap-3">
    <View className="w-[28] h-[28] rounded-full items-center justify-center" style={{ backgroundColor: COLORS[a] }}>
      <Text className="text-xs font-bold text-white">{String.fromCharCode(65 + a)}</Text>
    </View>
    <View className="grow shrink">
      <View className="flex-row gap-2"><Text className="text-xs text-[#9aa4b2]">User {a}</Text><Text className="text-xs text-[#6b7480]">{clock(minute[p.i])}</Text></View>
      <Text className="text-sm text-[#e6e8eb]">{words(p.i)}</Text>
    </View>
  </View>;
}

const list = createNodeRef();
function App() {
  return <View className="grow bg-[#2b2d31]">
    <VirtualList ref={list} count={N} estimatedItemHeight={52} className="grow">{(i: i32) => <Row i={i} />}</VirtualList>
    <Text className="px-4 py-1 text-xs text-[#6b7480]">{N} messages</Text>
  </View>;
}
render(App, 0x2b2d31, null);

const mode = env('CHAT_SCROLL'), dir: number = mode === 'up' ? -6 : mode === 'jump' ? 0 : 6;
if (env('CHAT_SCROLL') !== '') {
  let f = 0;
  setInterval(() => {
    f++;
    const h = list.node;
    if (h < 0) return;
    const n = ui.inspectNode(h);
    if (n === null) return;
    if (f === 2 || (dir !== 0 && f % 120 === 0)) ui.scrollTo(h, 0, (hash(f) % N) * 52); else if (dir !== 0) ui.scrollTo(h, 0, n.sy + dir);
  }, 16);
}
