// Discord's Markdown drawn (markdown.ts parses it): a block is one selectable Text with coloured runs and its custom emoji as pictures in
// the lines; code blocks, quotes, headings, subtext and list items around it. Messages, embeds and system rows draw their text with it.
import { useRef, useEffect } from 'zinc:ui/react';
import * as ui from 'zinc:ui';
import { store } from '../state';
import { parse, onlyEmoji, MdBlock, K_QUOTE, K_HEADING, K_SUB, K_CODE, K_LIST, R_CODE, R_LINK, R_MENTION, R_SPOILER, R_EMOJI, R_TIME } from '../markdown';
import { cdnPicture, emojiKey } from '../services/cdn';
import { CodeBlock } from './CodeBlock';
import { TEXT_MAIN, TEXT_MUTED, TEXT_STRONG, TEXT_MENTION, TEXT_LINK, TEXT_CODE, SPOILER, EMOJI, EMOJI_BIG } from '../constants';
import { runColor } from '../theme';

/** Names for the mentions of a message. */
export function names(kind: string, id: string): string {
  if (kind === '#') { const c = store.findChannel(id); return c !== null ? c.name : 'unknown-channel'; }
  if (kind === '&') return store.roleName(id);
  return store.userName(id);
}

const TIME = runColor('strong');   // a timestamp: brighter than the text (Discord draws it on a light box)
const color = (role: i32): i32 => role === R_CODE ? TEXT_CODE : role === R_LINK ? TEXT_LINK : role === R_MENTION ? TEXT_MENTION
  : role === R_SPOILER ? SPOILER : role === R_TIME ? TIME : -1;

/** A block of text: one node, its runs coloured by role and its custom emoji drawn as pictures in its lines (large in a message of only
 *  emoji), so they wrap with the words. */
function Paragraph(p: { b: MdBlock; className: string; big: boolean }) {
  const ref = useRef<i32>(-1);
  const b = p.b;
  useEffect((): void => {
    if (ref.current < 0) return;
    const r: i32[] = [];
    let plain = true, e = 0;
    for (let k = 0; k < b.runs.length; k += 3) {
      const role = b.runs[k + 2];
      if (b.runs[k + 1] !== 0 || role !== 0) plain = false;
      r.push(b.runs[k]);
      if (role === R_EMOJI && e < b.emoji.length) {
        const s = p.big ? EMOJI_BIG : EMOJI;
        r.push(ui.pictureRun(s, s)); r.push(cdnPicture(emojiKey(b.emoji[e++])));
        continue;
      }
      r.push(b.runs[k + 1]);
      r.push(color(role));
    }
    ui.setTextRuns(ref.current, plain ? [] : r);
  }, null);
  return <Text ref={ref} className={`select-text ${p.className}`}>{b.text}</Text>;
}

function Block(p: { b: MdBlock; big: boolean; size: string }) {
  const b = p.b;
  if (b.kind === K_CODE) return <CodeBlock code={b.text} lang={b.lang} />;
  if (b.kind === K_QUOTE) return <View className="flex-row gap-3"><View className="w-[4] rounded bg-[var(--dc-faint)]" /><View className="grow basis-0"><Paragraph b={b} big={false} className={`${p.size} ${TEXT_MAIN}`} /></View></View>;
  if (b.kind === K_HEADING) return <Paragraph b={b} big={false} className={`mt-1 font-bold ${TEXT_STRONG} ${b.level === 1 ? 'text-[24px]' : b.level === 2 ? 'text-[20px]' : 'text-[16px]'}`} />;
  if (b.kind === K_SUB) return <Paragraph b={b} big={false} className={`text-xs ${TEXT_MUTED}`} />;
  if (b.kind === K_LIST) return <View className={`flex-row ${b.level > 0 ? 'pl-6' : ''}`}>
    <Text className={`w-[24] ${p.size} ${TEXT_MAIN}`}>{b.marker}</Text>
    <View className="grow basis-0"><Paragraph b={b} big={false} className={`${p.size} ${TEXT_MAIN}`} /></View>
  </View>;
  return <Paragraph b={b} big={p.big} className={`${p.size} ${TEXT_MAIN}`} />;
}

/** A text in Discord's Markdown, its spoilers shown once `revealed`; size: the class of its text size. */
export function Markdown(p: { text: string; revealed: boolean; size: string }) {
  const blocks = parse(p.text, names, p.revealed);
  const big = onlyEmoji(blocks);
  return <View>{blocks.map((b: MdBlock, i: i32) => <Block key={`${i}`} b={b} big={big} size={p.size} />)}</View>;
}
