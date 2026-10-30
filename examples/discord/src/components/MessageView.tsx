// The open channel: its name, the connection state, the history newest at the bottom in a virtual list (only the rows on screen exist; the
// view follows the end as messages come, and the page before loads when it is scrolled to its top), each message with its author's avatar,
// Discord's Markdown, custom emoji, images and files, the actions of a message under the pointer (reply; edit and delete on mine), and the
// composer with who is typing and a button to send files (dropping files on the window sends them too: main.tsx).
import { useRef, useEffect, useState } from 'zinc:ui/react';
import * as ui from 'zinc:ui';
import { Icon } from 'zinc:icons';
import * as dialog from 'zinc:system/dialog';
import { store, Message, Attachment } from '../state';
import { parse, onlyEmoji, MdBlock, K_QUOTE, K_HEADING, K_SUB, K_CODE, R_CODE, R_LINK, R_MENTION, R_SPOILER, R_EMOJI } from '../markdown';
import { Avatar } from './Avatar';
import { cdnPicture, avatarKey, emojiKey, attachmentPicture } from '../services/cdn';
import { BG_MAIN, BG_INPUT, BG_SIDE, BG_HOVER, TEXT_MAIN, TEXT_MUTED, TEXT_STRONG, TEXT_ERROR, TEXT_MENTION, TEXT_LINK, TEXT_CODE, SPOILER,
  AVATAR, EMOJI, EMOJI_BIG, MEDIA_MAX_W, MEDIA_MAX_H, ROW_ESTIMATE, OLDER_AT } from '../constants';

const LINK = (): i32 => TEXT_LINK;
const MUTED = (): i32 => 0xb5bac1;
function time(iso: string): string { return iso.length >= 16 ? iso.slice(0, 10) + ' ' + iso.slice(11, 16) : iso; }

/** Names for the mentions of a message. */
function names(kind: string, id: string): string {
  if (kind === '#') { const c = store.findChannel(id); return c !== null ? c.name : 'unknown-channel'; }
  if (kind === '&') return store.roleName(id);
  return store.userName(id);
}

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
      r.push(role === R_CODE ? TEXT_CODE : role === R_LINK ? TEXT_LINK : role === R_MENTION ? TEXT_MENTION : role === R_SPOILER ? SPOILER : -1);
    }
    ui.setTextRuns(ref.current, plain ? [] : r);
  }, null);
  return <Text ref={ref} className={`select-text ${p.className}`}>{b.text}</Text>;
}

function Block(p: { b: MdBlock; big: boolean }) {
  const b = p.b;
  if (b.kind === K_CODE) return <View className={`my-1 px-3 py-2 rounded border border-[#1e1f22] ${BG_SIDE}`}>
    <Text className={`select-text font-mono text-[13px] whitespace-pre-wrap ${TEXT_MAIN}`}>{b.text}</Text>
  </View>;
  if (b.kind === K_QUOTE) return <View className="flex-row gap-3"><View className="w-[4] rounded bg-[#4e5058]" /><View className="grow basis-0"><Paragraph b={b} big={false} className={`text-[15px] ${TEXT_MAIN}`} /></View></View>;
  if (b.kind === K_HEADING) return <Paragraph b={b} big={false} className={`mt-1 font-bold ${TEXT_STRONG} ${b.level === 1 ? 'text-[24px]' : b.level === 2 ? 'text-[20px]' : 'text-[16px]'}`} />;
  if (b.kind === K_SUB) return <Paragraph b={b} big={false} className={`text-xs ${TEXT_MUTED}`} />;
  return <Paragraph b={b} big={p.big} className={`text-[15px] ${TEXT_MAIN}`} />;
}

function Body(p: { m: Message }) {
  const m = p.m;
  const blocks = parse(m.content, names, store.revealed.has(m.id));
  const big = onlyEmoji(blocks);
  const inner = <View className={m.pending ? 'opacity-50' : ''}>
    {blocks.map((b: MdBlock, i: i32) => <Block key={`${i}`} b={b} big={big} />)}
    {m.edited ? <Text className={`text-[11px] ${TEXT_MUTED}`}>(edited)</Text> : null}
    {m.failed ? <Text className={`text-xs ${TEXT_ERROR}`}>Not sent.</Text> : null}
  </View>;
  // a click shows the spoilers
  return m.content.indexOf('||') >= 0 && !store.revealed.has(m.id) ? <View onPress={() => store.revealSpoilers(m)}>{inner}</View> : inner;
}

/** A file of a message: an image at its own size within 400 x 300 (its box is known before it loads, so nothing moves when it comes), or
 *  a link with its name and size. */
function Media(p: { a: Attachment }) {
  const a = p.a;
  if (a.image()) {
    let w = Math.min(a.width, MEDIA_MAX_W), h = Math.round(a.height * w / a.width);
    if (h > MEDIA_MAX_H) { h = MEDIA_MAX_H; w = Math.round(a.width * h / a.height); }
    return <Image image={attachmentPicture(a.url)} className={`mt-1 w-[${w}] h-[${h}] rounded-lg bg-[#2b2d31] object-cover`} aria-label={a.filename} />;
  }
  const kb = Math.max(1, Math.round(a.size / 1024));
  return <View className={`mt-1 self-start px-3 py-2 flex-row items-center gap-2 rounded-lg border border-[#1e1f22] ${BG_SIDE}`}>
    <Icon name="paperclip" size={16} color={LINK} />
    <Text className="text-sm text-[#00a8fc]">{a.filename}</Text>
    <Text className={`text-xs ${TEXT_MUTED}`}>{a.url === '' ? 'sending…' : `${kb} KB`}</Text>
  </View>;
}

function Action(p: { icon: string; label: string; danger: boolean; onPress: () => void }) {
  return <View className={`w-8 h-8 items-center justify-center ${p.danger ? 'bg-[#da373c]' : BG_HOVER}`} aria-label={p.label} onPress={p.onPress}>
    <Icon name={p.icon} size={16} color={MUTED} />
  </View>;
}

function Row(p: { m: Message; head: boolean; last: boolean }) {
  const m = p.m;
  const [confirm, setConfirm] = useState<boolean>(false);
  const mine = m.authorId === store.me.id;
  const on = store.editing === m || store.replyTo === m;
  const hash = p.head ? store.avatarOf(m.authorId) : '';
  return <View className={`group px-4 ${p.head ? 'pt-4' : 'pt-[2]'} ${p.last ? 'pb-6' : ''} ${on ? 'bg-[#2e3035]' : 'hover:bg-[#2e3035]'}`}>
    {m.replyTo !== '' ? <Text className={`pl-14 text-xs ${TEXT_MUTED}`} numberOfLines={1}>{'↱ ' + m.replyTo}</Text> : null}
    <View className="flex-row gap-4">
      <View className={`w-[${AVATAR}]`}>
        {p.head ? <Avatar picture={hash !== '' ? cdnPicture(avatarKey(m.authorId, hash)) : -1} name={m.author} size={AVATAR} round={true} /> : null}
      </View>
      <View className="grow basis-0">
        {p.head ? <View className="flex-row items-end gap-2">
          <Text className={`font-semibold ${TEXT_STRONG}`}>{m.author}</Text>
          <Text className={`text-xs ${TEXT_MUTED}`}>{time(m.timestamp)}</Text>
        </View> : null}
        <Body m={m} />
        {m.attachments.map((a: Attachment, i: i32) => <Media key={`${i}`} a={a} />)}
      </View>
    </View>
    {m.pending ? null : <View className={`absolute -top-2 right-4 flex-row rounded border border-[#1e1f22] ${BG_MAIN} opacity-0 group-hover:opacity-100`}>
      {m.failed ? null : <Action icon="corner-up-left" label="Reply" danger={false} onPress={() => store.reply(m)} />}
      {mine && !m.failed ? <Action icon="pencil" label="Edit" danger={false} onPress={() => store.edit(m)} /> : null}
      {mine ? <Action icon="trash-2" label={confirm ? 'Delete: click again' : 'Delete'} danger={confirm}
        onPress={() => { if (confirm) store.remove(m); else setConfirm(true); }} /> : null}
    </View>}
  </View>;
}

/** Picks files and sends them (the system's open dialog). */
async function pickFiles(): Promise<void> {
  const o = new dialog.OpenOptions();
  o.title = 'Send files'; o.multiple = true;
  const paths = await dialog.open(o);
  if (paths !== null) store.sendFiles(paths);
}

function Composer(p: { name: string }) {
  const keys = (e: ui.KeyEvent): void => {
    if (e.key === 'Enter' && !e.shift) { store.send(); e.preventDefault(); }
    else if (e.key === 'Escape' && (store.replyTo !== null || store.editing !== null)) { store.cancel(); e.preventDefault(); }
    else if (e.key === 'ArrowUp' && store.draft === '') { const m = store.lastOwn(); if (m !== null) { store.edit(m); e.preventDefault(); } }
  };
  const r = store.replyTo, ed = store.editing, typing = store.typingText(store.channelId);
  return <View className="px-4">
    {r !== null || ed !== null ? <View className={`h-[32] px-4 flex-row items-center rounded-t-lg ${BG_SIDE}`}>
      <Text className={`grow text-sm ${TEXT_MUTED}`} numberOfLines={1}>{r !== null ? `Replying to ${r.author}` : 'Editing a message: Enter saves, Escape cancels'}</Text>
      <View className="p-1" aria-label="Cancel" onPress={() => store.cancel()}><Icon name="x" size={16} color={MUTED} /></View>
    </View> : null}
    <View className={`pr-4 flex-row items-start ${r !== null || ed !== null ? 'rounded-b-lg' : 'rounded-lg'} ${BG_INPUT}`}>
      <View className="px-4 py-[12]" aria-label="Send files" onPress={() => { pickFiles(); }}><Icon name="circle-plus" size={20} color={MUTED} /></View>
      <View className="grow basis-0 py-[11]">
        <TextArea rows={0} className={`w-full text-[15px] ${TEXT_MAIN}`} value={store.draft} placeholder={`Message ${p.name}`}
          onInput={(v: string) => store.typed(v)} onKeyDown={keys} aria-label="Message" />
      </View>
    </View>
    <Text className={`h-[22] text-xs font-semibold ${TEXT_MAIN}`} numberOfLines={1}>{typing}</Text>
  </View>;
}

// The row that was at the top before older messages came: shown at the top again once they are in the list (not a jump to the oldest).
let keepRow: i32 = -1;
let shown: i32 = -1;
/** The history's list node (-1 before it is shown): the bench of main.tsx scrolls it. */
export function historyList(): i32 { return shown; }
async function older(): Promise<void> { const n = await store.loadOlder(); if (n > 0) keepRow = n; }

/** The history: a virtual list of rows of their own heights, which opens at its end and follows it. */
function History(p: { list: Message[] }) {
  const ref = useRef<i32>(-1);
  const list = p.list;
  useEffect((): void => {
    shown = ref.current;
    // older messages when the reader goes up near the top: a scroll down (the list opening at its end, following a new message) never asks
    let y = 0;
    ui.onScroll(ref.current, (e: ui.ResponderEvent, g: ui.GestureState): void => {
      const now = e.nativeEvent.contentOffset.y;
      if (now < y && now < OLDER_AT) older();
      y = now;
    });
  }, []);
  useEffect((): void => { if (keepRow >= 0) { ui.scrollToRow(ref.current, keepRow); keepRow = -1; } }, null);
  return <VirtualList ref={ref} count={list.length} estimatedItemHeight={ROW_ESTIMATE} className="grow" stickToBottom>
    {(i: i32) => <Row key={list[i].id !== '' ? list[i].id : list[i].nonce} m={list[i]} head={i === 0 || list[i - 1].authorId !== list[i].authorId}
      last={i === list.length - 1} />}
  </VirtualList>;
}

export function MessageView() {
  const c = store.findChannel(store.channelId);
  const list = store.messages.get(store.channelId);
  const banner = store.stage === 'reconnecting' ? 'Connection lost, reconnecting…' : store.stage === 'failed' ? 'Disconnected.' : '';
  const title = c !== null ? (c.guildId !== '' ? '#' : '@') + c.name : '';
  return <View className={`grow basis-0 ${BG_MAIN}`}>
    <View className="h-[48] px-4 flex-row items-center border-b border-[#26272b]">
      <Text className={`grow font-semibold ${TEXT_STRONG}`} numberOfLines={1}>{title}</Text>
    </View>
    {banner !== '' ? <Text className="px-4 py-1 text-sm text-white bg-[#da373c]">{banner}</Text> : null}
    {store.error !== '' ? <Text className={`px-4 py-1 text-sm ${TEXT_ERROR}`}>{store.error}</Text> : null}
    {list === undefined ? <Text className={`grow p-4 ${TEXT_MUTED}`}>{c === null ? 'No channel open.' : 'Loading…'}</Text> : <History key={store.channelId} list={list} />}
    {c !== null ? <Composer name={title} /> : null}
  </View>;
}
