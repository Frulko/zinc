// The open channel: its name, the connection state, the messages newest at the bottom (the view follows the end as messages come) in
// Discord's Markdown, the actions of a message under the pointer (reply; edit and delete on mine), and the composer with who is typing.
// Images and the member list come with ZN-868.
import { useRef, useEffect, useState } from 'zinc:ui/react';
import * as ui from 'zinc:ui';
import { Icon } from 'zinc:icons';
import { store, Message } from '../state';
import { parse, MdBlock, K_QUOTE, K_HEADING, K_SUB, K_CODE, R_CODE, R_LINK, R_MENTION, R_SPOILER } from '../markdown';
import { BG_MAIN, BG_INPUT, BG_SIDE, BG_HOVER, TEXT_MAIN, TEXT_MUTED, TEXT_STRONG, TEXT_ERROR, TEXT_MENTION, TEXT_LINK, TEXT_CODE, SPOILER } from '../constants';

const LINK = (): i32 => TEXT_LINK;
const MUTED = (): i32 => 0xb5bac1;
function time(iso: string): string { return iso.length >= 16 ? iso.slice(0, 10) + ' ' + iso.slice(11, 16) : iso; }

/** Names for the mentions of a message. */
function names(kind: string, id: string): string {
  if (kind === '#') { const c = store.findChannel(id); return c !== null ? c.name : 'unknown-channel'; }
  if (kind === '&') return 'role';         // ponytail: role names come with the member list (ZN-868)
  return store.userName(id);
}

/** One block: its text in one node, its runs coloured by role. */
function Runs(p: { b: MdBlock; className: string }) {
  const ref = useRef<i32>(-1);
  const b = p.b;
  useEffect((): void => {
    if (ref.current < 0) return;
    const r: i32[] = [];
    let plain = true;
    for (let k = 0; k < b.runs.length; k += 3) {
      const role = b.runs[k + 2];
      if (b.runs[k + 1] !== 0 || role !== 0) plain = false;
      r.push(b.runs[k]); r.push(b.runs[k + 1]);
      r.push(role === R_CODE ? TEXT_CODE : role === R_LINK ? TEXT_LINK : role === R_MENTION ? TEXT_MENTION : role === R_SPOILER ? SPOILER : -1);
    }
    ui.setTextRuns(ref.current, plain ? [] : r);
  }, null);
  return <Text ref={ref} className={`select-text ${p.className}`}>{b.text}</Text>;
}

function Block(p: { b: MdBlock }) {
  const b = p.b;
  if (b.kind === K_CODE) return <View className={`my-1 px-3 py-2 rounded border border-[#1e1f22] ${BG_SIDE}`}>
    <Text className={`select-text font-mono text-[13px] whitespace-pre-wrap ${TEXT_MAIN}`}>{b.text}</Text>
  </View>;
  if (b.kind === K_QUOTE) return <View className="flex-row gap-3"><View className="w-[4] rounded bg-[#4e5058]" /><Runs b={b} className={`grow text-[15px] ${TEXT_MAIN}`} /></View>;
  if (b.kind === K_HEADING) return <Runs b={b} className={`mt-1 font-bold ${TEXT_STRONG} ${b.level === 1 ? 'text-[24px]' : b.level === 2 ? 'text-[20px]' : 'text-[16px]'}`} />;
  if (b.kind === K_SUB) return <Runs b={b} className={`text-xs ${TEXT_MUTED}`} />;
  return <Runs b={b} className={`text-[15px] ${TEXT_MAIN}`} />;
}

function Body(p: { m: Message }) {
  const m = p.m;
  const blocks = parse(m.content, names, store.revealed.has(m.id));
  const inner = <View className={m.pending ? 'opacity-50' : ''}>
    {blocks.map((b: MdBlock, i: i32) => <Block key={`${i}`} b={b} />)}
    {m.edited ? <Text className={`text-[11px] ${TEXT_MUTED}`}>(edited)</Text> : null}
    {m.failed ? <Text className={`text-xs ${TEXT_ERROR}`}>Not sent.</Text> : null}
  </View>;
  // a click shows the spoilers
  return m.content.indexOf('||') >= 0 && !store.revealed.has(m.id) ? <View onPress={() => store.revealSpoilers(m)}>{inner}</View> : inner;
}

function Action(p: { icon: string; label: string; danger: boolean; onPress: () => void }) {
  return <View className={`w-8 h-8 items-center justify-center ${p.danger ? 'bg-[#da373c]' : BG_HOVER}`} aria-label={p.label} onPress={p.onPress}>
    <Icon name={p.icon} size={16} color={MUTED} />
  </View>;
}

function Row(p: { m: Message; head: boolean }) {
  const m = p.m;
  const [confirm, setConfirm] = useState<boolean>(false);
  const mine = m.authorId === store.me.id;
  const on = store.editing === m || store.replyTo === m;
  return <View className={`group px-4 ${p.head ? 'pt-4' : 'pt-[2]'} ${on ? 'bg-[#2e3035]' : 'hover:bg-[#2e3035]'}`}>
    {m.replyTo !== '' ? <Text className={`text-xs ${TEXT_MUTED}`} numberOfLines={1}>{'↱ ' + m.replyTo}</Text> : null}
    {p.head ? <View className="flex-row items-end gap-2">
      <Text className={`font-semibold ${TEXT_STRONG}`}>{m.author}</Text>
      <Text className={`text-xs ${TEXT_MUTED}`}>{time(m.timestamp)}</Text>
    </View> : null}
    <Body m={m} />
    {m.attachments.map((f: string) => <View key={f} className="flex-row items-center gap-1"><Icon name="paperclip" size={14} color={LINK} /><Text className="text-sm text-[#00a8fc]">{f}</Text></View>)}
    {m.pending ? null : <View className={`absolute -top-2 right-4 flex-row rounded border border-[#1e1f22] ${BG_MAIN} opacity-0 group-hover:opacity-100`}>
      {m.failed ? null : <Action icon="corner-up-left" label="Reply" danger={false} onPress={() => store.reply(m)} />}
      {mine && !m.failed ? <Action icon="pencil" label="Edit" danger={false} onPress={() => store.edit(m)} /> : null}
      {mine ? <Action icon="trash-2" label={confirm ? 'Delete: click again' : 'Delete'} danger={confirm}
        onPress={() => { if (confirm) store.remove(m); else setConfirm(true); }} /> : null}
    </View>}
  </View>;
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
    <View className={`px-4 py-[11] ${r !== null || ed !== null ? 'rounded-b-lg' : 'rounded-lg'} ${BG_INPUT}`}>
      <TextArea rows={0} className={`w-full text-[15px] ${TEXT_MAIN}`} value={store.draft} placeholder={`Message ${p.name}`}
        onInput={(v: string) => store.typed(v)} onKeyDown={keys} aria-label="Message" />
    </View>
    <Text className={`h-[22] text-xs font-semibold ${TEXT_MAIN}`} numberOfLines={1}>{typing}</Text>
  </View>;
}

export function MessageView() {
  const c = store.findChannel(store.channelId);
  const list = store.messages.get(store.channelId);
  const banner = store.stage === 'reconnecting' ? 'Connection lost, reconnecting…' : store.stage === 'failed' ? 'Disconnected.' : '';
  const title = c !== null ? (c.guildId !== '' ? '#' : '@') + c.name : '';
  return <View className={`grow ${BG_MAIN}`}>
    <View className="h-[48] px-4 flex-row items-center border-b border-[#26272b]">
      <Text className={`grow font-semibold ${TEXT_STRONG}`} numberOfLines={1}>{title}</Text>
    </View>
    {banner !== '' ? <Text className="px-4 py-1 text-sm text-white bg-[#da373c]">{banner}</Text> : null}
    {store.error !== '' ? <Text className={`px-4 py-1 text-sm ${TEXT_ERROR}`}>{store.error}</Text> : null}
    <ScrollView className="grow" stickToBottom>
      <View className="pb-6">
        {list === undefined ? <Text className={`p-4 ${TEXT_MUTED}`}>{c === null ? 'No channel open.' : 'Loading…'}</Text>
          : list.map((m: Message, i: i32) => <Row key={m.id !== '' ? m.id : m.nonce} m={m} head={i === 0 || list[i - 1].authorId !== m.authorId} />)}
      </View>
    </ScrollView>
    {c !== null ? <Composer name={title} /> : null}
  </View>;
}
