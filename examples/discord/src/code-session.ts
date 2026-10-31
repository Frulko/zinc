// DISCORD_DEMO=code (tests/t1/discord_code.sh): the composer's code tab against the fake Discord. It writes a long TypeScript block in the
// tab and sends it with a message (a fenced block with its language reaches the server), reads it folded, unfolds it, and leaves the tab open
// on a short block for the last frame.
import { quit } from 'zinc:gfx';
import * as ui from 'zinc:ui';
import { env } from 'zinc:sys';
import { store, Message } from './state';
import { setCode, sendWithCode, codeOpen } from './components/CodeInsert';
import { lineCount } from './components/CodeBlock';

const wait = (ms: number): Promise<void> => new Promise<void>((done: () => void) => { setTimeout(done, ms); });
function until(cond: () => boolean): Promise<void> {
  return new Promise<void>((done: () => void) => { const t = setInterval(() => { if (cond()) { clearInterval(t); done(); } }, 10); });
}
const LONG = `interface Point { x: number; y: number }

// the distance between two points
export function distance(a: Point, b: Point): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

const origin: Point = { x: 0, y: 0 };
console.log(distance(origin, { x: 3, y: 4 }));   // 5
`;

export async function codeSession(): Promise<void> {
  await until(() => store.stage === 'ready');
  store.selectGuild('200');
  store.selectChannel('302');
  await until(() => store.messages.get('302') !== undefined);
  store.typed('Here is the helper');
  setCode(LONG, 'ts');
  console.log(`code tab open ${codeOpen()}`);
  sendWithCode();
  console.log(`code tab open after send ${codeOpen()}`);
  await until(() => { const l = store.messages.get('302') as Message[]; return l.length > 0 && l[l.length - 1].content.indexOf('```ts') >= 0 && !l[l.length - 1].pending; });
  const l = store.messages.get('302') as Message[];
  console.log(`sent ${JSON.stringify(l[l.length - 1].content.slice(0, 40))} block lines ${lineCount(LONG)}`);
  await wait(600);
  const step = env('DISCORD_CODE');   // 'unfold' leaves the block open, 'pick' the language list
  if (step === 'unfold') { ui.click(ui.find('Show code (7 more lines)')); await wait(600); console.log(`unfolded ${ui.find('Hide code') >= 0}`); quit(); return; }
  setCode('print("hello")\nfor i in range(3):\n    print(i)', 'py');
  await wait(800);
  if (step === 'pick') { ui.click(ui.find('py')); await wait(400); }
  quit();
}
