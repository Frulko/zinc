// The open channel: its name, the connection state, the history newest at the bottom in a virtual list (only the rows on screen exist; the
// view follows the end as messages come, and the page before loads when it is scrolled to its top), each message with its author's avatar,
// Discord's Markdown (components/Markdown.tsx) and what it carries (components/Content.tsx), system messages as one line, replies, answers
// to commands and forwarded messages with their header, the actions of a message under the pointer (react, reply; edit and delete on mine),
// and the composer with who is typing and a button to send files (dropping files on the window sends them too: main.tsx). A forum shows
// its posts instead.
import { useRef, useEffect, useState } from 'zinc:ui/react';
import * as ui from 'zinc:ui';
import { Icon } from 'zinc:icons';
import { Tooltip } from 'zinc:ui/kit';
import { tr, trn } from '../i18n';
import * as dialog from 'zinc:system/dialog';
import { store, Message, Channel, compareIds } from '../state';
import { isBody, systemIcon } from '../content';
import { Markdown } from './Markdown';
import { Content } from './Content';
import { Avatar } from './Avatar';
import { cdnPicture, avatarKey } from '../services/cdn';
import { cannotSend, countdown } from '../safety/index';
import { BG_MAIN, BG_INPUT, BG_SURFACE, BG_HOVER, TEXT_MAIN, TEXT_MUTED, TEXT_STRONG, TEXT_ERROR, avatarSize, ROW_ESTIMATE, OLDER_AT } from '../constants';
import { color, rounded, textClass, compact, currentTheme, isSlack, isTeams } from '../theme';
import { BackButton } from './BackButton';
import { CodeInsert, CodePanel, sendWithCode } from './CodeInsert';
import { Picker, PickerButtons, pickerTab, openPicker } from './Picker';

const MUTED = (): i32 => color('icon');
function time(iso: string): string { return iso.length >= 16 ? iso.slice(0, 10) + ' ' + iso.slice(11, 16) : iso; }
/** Slack and Teams show the time of day beside the name (the day has its divider). */
function stamp(iso: string): string { return isSlack() || isTeams() ? iso.slice(11, 16) : time(iso); }
const day = (m: Message): string => m.timestamp.slice(0, 10);

/** A link or a GIF alone, which its embed draws: the text is not repeated. */
function linkShownByEmbed(m: Message): boolean {
  return m.embeds.length > 0 && m.embeds.every((e) => e.pictureOnly()) && /^https?:\/\/\S+$/.test(m.content.trim());
}

function Body(p: { m: Message }) {
  const m = p.m;
  const inner = <View className={m.pending ? 'opacity-50' : ''}>
    {m.content !== '' && !linkShownByEmbed(m) ? <Markdown text={m.content} revealed={store.revealed.has(m.id)} size={textClass()} /> : null}
    {m.edited ? <Text className={`text-[11px] ${TEXT_MUTED}`}>{tr('discord.message.edited')}</Text> : null}
    {m.failed ? <Text className={`text-xs ${TEXT_ERROR}`}>{tr('discord.message.not_sent')}</Text> : null}
  </View>;
  // a click shows the spoilers
  return m.content.indexOf('||') >= 0 && !store.revealed.has(m.id) ? <View onPress={() => store.revealSpoilers(m)}>{inner}</View> : inner;
}

/** A forwarded message: its copy in a quote, "Forwarded" over it and where it came from under it. */
function Forwarded(p: { f: Message }) {
  const f = p.f, from = store.findChannel(f.channelId);
  return <View className="mt-1 flex-row gap-3">
    <View className="w-[4] rounded bg-[var(--dc-faint)]" />
    <View className="grow basis-0">
      <View className="flex-row items-center gap-1"><Icon name="forward" size={14} color={MUTED} /><Text className={`text-xs italic ${TEXT_MUTED}`}>{tr('discord.message.forwarded')}</Text></View>
      <Body m={f} />
      <Content m={f} />
      <Text className={`mt-1 text-xs ${TEXT_MUTED}`}>{`${from !== null ? '#' + from.name : tr('discord.message.another_channel')} • ${time(f.timestamp)}`}</Text>
    </View>
  </View>;
}

function Action(p: { icon: string; label: string; danger: boolean; onPress: () => void }) {
  return <Tooltip label={p.label}><View className={`w-8 h-8 items-center justify-center ${p.danger ? 'bg-[var(--dc-danger)]' : BG_HOVER}`} aria-label={p.label} onPress={p.onPress}>
    <Icon name={p.icon} size={16} color={MUTED} />
  </View></Tooltip>;
}

/** Something that happened (a join, a pin, a boost, a call...): an icon and one line with the names in bold, no avatar. */
function SystemRow(p: { m: Message; last: boolean }) {
  const m = p.m;
  return <View className={`px-4 pt-[6] ${p.last ? 'pb-6' : 'pb-[2]'}`}>
    <View className="flex-row gap-4 items-center">
      <View className={`w-[${avatarSize()}] items-center`}><Icon name={systemIcon(m.type)} size={16} color={MUTED} /></View>
      <View className="grow basis-0 flex-row items-center gap-2">
        <View className="shrink"><Markdown text={m.system} revealed={true} size={`text-[15px] ${TEXT_MUTED}`} /></View>
        <Text className={`text-xs ${TEXT_MUTED}`}>{time(m.timestamp)}</Text>
      </View>
    </View>
    {m.thread !== null || m.reactions.length > 0 ? <View className={`pl-[${avatarSize() + 16}]`}><Content m={m} /></View> : null}
  </View>;
}

/** The line above the first message not read when the channel was opened. */
function NewLine() {
  return <View className="mx-4 mt-2 h-[1] bg-[var(--dc-badge)]">
    <Text className="absolute right-0 -top-[7] px-1 rounded-sm bg-[var(--dc-badge)] text-[10px] font-bold text-white">{tr('discord.message.new')}</Text>
  </View>;
}

/** A day's divider: its date in a pill centred on a line. */
function DayLine(p: { date: string }) {
  return <View className="mx-5 mt-3 h-[28] items-center justify-center">
    <View className="absolute left-0 right-0 top-[14] h-[1] bg-[var(--dc-divider)]" />
    <Text className={`px-3 py-[2] rounded-full border border-[var(--dc-divider)] ${BG_MAIN} text-xs font-bold ${TEXT_STRONG}`}>{p.date}</Text>
  </View>;
}

function Row(p: { m: Message; head: boolean; last: boolean }) {
  const m = p.m;
  const [confirm, setConfirm] = useState<boolean>(false);
  if (m.system !== '') return <SystemRow m={m} last={p.last} />;
  const mine = m.authorId === store.me.id;
  const on = store.editing === m || store.replyTo === m || store.jumpId === m.id;
  const head = p.head || m.replyTo !== '' || m.interaction !== '';   // a reply or a command's answer starts a group, as on Discord
  const hash = head ? store.avatarOf(m.authorId) : '', av = avatarSize(), slack = isSlack(), teams = isTeams(), indent = `pl-[${av + (slack ? 8 : 16) + 0}]`;
  const content = <View className={teams ? '' : 'grow basis-0'}>
    {head ? <View className="flex-row items-center gap-2">
      <Text className={`${slack ? 'font-bold' : 'font-semibold'} ${TEXT_STRONG}`}>{m.author}</Text>
      {m.bot ? <Text className="px-[4] rounded bg-[var(--dc-accent)] text-[10px] font-bold text-white">{tr('discord.message.app')}</Text> : null}
      <Text className={`text-xs ${TEXT_MUTED}`}>{stamp(m.timestamp)}</Text>
    </View> : null}
    {isBody(m.type) || m.content !== '' ? <Body m={m} /> : null}
    {m.forwarded !== null ? <Forwarded f={m.forwarded} /> : null}
    <Content m={m} />
  </View>;
  return <View className={`group ${slack ? 'px-5' : 'px-4'} ${head ? (compact() ? 'pt-2' : 'pt-4') : compact() ? 'pt-0' : 'pt-[2]'} ${p.last ? 'pb-6' : ''} ${on ? 'bg-[var(--dc-row-hover)]' : 'hover:bg-[var(--dc-row-hover)]'}`}>
    {m.replyTo !== '' ? <Text className={`${indent} text-xs ${TEXT_MUTED} ${m.replyDeleted ? 'italic' : 'hover:text-[var(--dc-text)]'}`} numberOfLines={1}
      onPress={() => { if (!m.replyDeleted) store.jumpTo(m.replyId); }}>{'↱ ' + m.replyTo}</Text> : null}
    {m.interaction !== '' ? <Text className={`${indent} text-xs ${TEXT_MUTED}`} numberOfLines={1}>{'↱ ' + m.interaction}</Text> : null}
    <View className={`flex-row ${slack ? 'gap-2' : teams ? 'gap-2' : 'gap-4'}`}>
      <View className={`w-[${av}]`}>
        {head ? <Avatar picture={hash !== '' ? cdnPicture(avatarKey(m.authorId, hash)) : -1} name={m.author} size={av} round={true} /> : null}
      </View>
      {teams ? <View className={`shrink max-w-[640] px-3 py-2 rounded-[6] ${mine ? 'bg-[var(--dc-accent-soft)]' : BG_SURFACE}`}>{content}</View> : content}
    </View>
    {m.pending ? null : <View className={`absolute -top-2 right-4 flex-row rounded border border-[var(--dc-border)] ${BG_MAIN} opacity-0 group-hover:opacity-100`}>
      {m.failed ? null : <Action icon="thumbs-up" label={tr('discord.message.add_reaction')} danger={false} onPress={() => store.react(m, null)} />}
      {m.failed ? null : <Action icon="face-slightly-smiling-plus" label={tr('discord.message.react')} danger={false} onPress={() => openPicker('emoji', m)} />}
      {m.failed ? null : <Action icon="corner-up-left" label={tr('discord.message.reply')} danger={false} onPress={() => store.reply(m)} />}
      {!m.failed && store.canPin(m.channelId) ? <Action icon="pin" label={m.pinned ? tr('discord.pane.unpin') : tr('discord.message.pin')} danger={false} onPress={() => { store.pin(m); }} /> : null}
      {mine && !m.failed ? <Action icon="pencil" label={tr('discord.message.edit')} danger={false} onPress={() => store.edit(m)} /> : null}
      {mine ? <Action icon="trash" label={confirm ? tr('discord.message.delete_again') : tr('discord.message.delete')} danger={confirm}
        onPress={() => { if (confirm) store.remove(m); else setConfirm(true); }} /> : null}
    </View>}
  </View>;
}

/** A forum: its posts, the latest active first, each with its tags, the start of its first message and its count of messages. */
function Forum(p: { c: Channel }) {
  const c = p.c;
  return <ScrollView className="grow">
    <View className="p-4 gap-2">
      {store.posts(c.id).map((t: Channel) => {
        const first = store.previews.get(t.id);
        return <View key={t.id} className={`px-4 py-3 gap-1 rounded-lg ${BG_SURFACE} ${BG_HOVER}`} aria-label={t.name} onPress={() => store.openThread(t.id)}>
          <Text className={`text-[16px] font-semibold ${TEXT_STRONG}`} numberOfLines={1}>{t.name}</Text>
          {t.tags.length > 0 ? <View className="flex-row gap-1">{t.tags.map((id: string) =>
            <Text key={id} className={`px-2 rounded-full bg-[var(--dc-input)] text-xs ${TEXT_MAIN}`}>{c.tagNames.get(id) ?? id}</Text>)}</View> : null}
          {first !== undefined ? <Text className={`text-sm ${TEXT_MUTED}`} numberOfLines={2}>{`${first.author}: ${first.content}`}</Text> : null}
          <View className="flex-row items-center gap-1"><Icon name="message-square" size={14} color={MUTED} /><Text className={`text-xs ${TEXT_MUTED}`}>{`${t.messageCount}`}</Text></View>
        </View>;
      })}
    </View>
  </ScrollView>;
}

/** Picks files and sends them (the system's open dialog). */
async function pickFiles(): Promise<void> {
  const o = new dialog.OpenOptions();
  o.title = tr('discord.composer.send_files'); o.multiple = true;
  const paths = await dialog.open(o);
  if (paths !== null) store.sendFiles(paths);
}

let formatOn = true;
/** The formatting row: what it adds goes at the end of the draft (ponytail: the field has no selection to wrap yet). */
function FormatBar() {
  const add = (text: string): void => { store.typed(store.draft + text); };
  const btn = (icon: string, label: string, text: string) => <Tooltip key={icon} label={label}><View className={`w-[28] h-[28] items-center justify-center rounded ${BG_HOVER}`} aria-label={label} onPress={() => add(text)}>
    <Icon name={icon} size={16} color={MUTED} /></View></Tooltip>;
  return <View className="flex-row items-center gap-0.5">
    {btn('bold', tr('discord.layout.bold'), '****')}
    {btn('italic', tr('discord.layout.italic'), '__')}
    {btn('strikethrough', tr('discord.layout.strike'), '~~~~')}
    {btn('link', tr('discord.layout.link'), '[](https://)')}
    {btn('list-ordered', tr('discord.layout.list_ordered'), '\n1. ')}
    {btn('list', tr('discord.layout.list_bullet'), '\n- ')}
    {btn('code', tr('discord.layout.code'),'``')}
  </View>;
}

/** Slack's and Teams' message box: the formatting row (over the field in Slack, in the bottom row in Teams), the field, a bottom row of buttons and the Send button. */
function Boxed(p: { field: any; keys: (e: ui.KeyEvent) => void; name: string; radius: i32; bare: boolean }) {
  const slack = isSlack();
  const aa = tr('discord.layout.format');
  return <View className={`border border-[var(--dc-border)] ${p.bare ? `rounded-b-[${p.radius}]` : rounded()} ${BG_INPUT} overflow-hidden`}>
    {slack && formatOn ? <View className={`px-2 py-1 border-b border-[var(--dc-divider)] ${BG_SURFACE}`}><FormatBar /></View> : null}
    <View className="px-3 py-[10]">
      <TextArea ref={p.field} rows={0} className={`w-full ${textClass()} ${TEXT_MAIN}`} value={store.draft} placeholder={tr('discord.composer.message_to', ['name', p.name])}
        onInput={(v: string) => store.typed(v)} onKeyDown={p.keys} aria-label={tr('discord.composer.message')} />
    </View>
    <View className="px-2 flex-row flex-wrap items-center gap-0.5">
      {slack ? <Tooltip label={tr('discord.composer.send_files')}><View className={`w-[28] h-[28] items-center justify-center rounded ${BG_HOVER}`} aria-label={tr('discord.composer.send_files')} onPress={() => { pickFiles(); }}><Icon name="plus" size={18} color={MUTED} /></View></Tooltip> : null}
      {slack ? <Tooltip label={aa}><View className={`w-[28] h-[28] items-center justify-center rounded ${formatOn ? 'bg-[var(--dc-selected)]' : BG_HOVER}`} aria-label={aa} onPress={() => { formatOn = !formatOn; store.changed(); }}><Icon name="type" size={18} color={MUTED} /></View></Tooltip> : <FormatBar />}
      <Tooltip label={tr('discord.layout.mention')}><View className={`w-[28] h-[28] items-center justify-center rounded ${BG_HOVER}`} aria-label={tr('discord.layout.mention')} onPress={() => store.typed(store.draft + '@')}><Icon name="at-sign" size={18} color={MUTED} /></View></Tooltip>
      <View className="grow basis-0" />
      <CodeInsert />
      <PickerButtons />
      {slack ? null : <Tooltip label={tr('discord.composer.send_files')}><View className={`w-[28] h-[28] items-center justify-center rounded ${BG_HOVER}`} aria-label={tr('discord.composer.send_files')} onPress={() => { pickFiles(); }}><Icon name="paperclip" size={18} color={MUTED} /></View></Tooltip>}
      <Tooltip label={tr('discord.layout.send')}><View className={`ml-1 ${slack ? 'w-[40] h-[28] rounded-[6] bg-[var(--dc-accent)]' : 'w-[32] h-[28] rounded'} items-center justify-center`} aria-label={tr('discord.layout.send')} onPress={() => sendWithCode()}>
        <Icon name="send" size={16} color={() => slack ? color('accentText') : color('accent')} />
      </View></Tooltip>
    </View>
  </View>;
}

function Composer(p: { name: string }) {
  const keys = (e: ui.KeyEvent): void => {
    if (e.key === 'Enter' && !e.shift) { sendWithCode(); e.preventDefault(); }
    else if (e.key === 'Escape' && (store.replyTo !== null || store.editing !== null)) { store.cancel(); e.preventDefault(); }
    else if (e.key === 'ArrowUp' && store.draft === '') { const m = store.lastOwn(); if (m !== null) { store.edit(m); e.preventDefault(); } }
  };
  const r = store.replyTo, ed = store.editing, typing = store.typingText(store.channelId), radius = currentTheme().radius;
  const field = useRef<i32>(-1);
  // the guard says when nothing can be written here (no permission, a blocked person, a DM closed to me) and counts down a slowmode
  const no = cannotSend(store.channelId), wait = countdown(store.channelId);
  if (no !== '') return <View className="px-4">
    <View className={`h-[44] px-4 justify-center rounded-lg ${BG_INPUT}`}><Text className={`text-sm ${TEXT_MUTED}`} numberOfLines={1}>{no}</Text></View>
    <Text className={`h-[22] text-xs font-semibold ${TEXT_MAIN}`} numberOfLines={1}>{typing}</Text>
  </View>;
  return <View className="px-4">
    {r !== null || ed !== null ? <View className={`h-[32] px-4 flex-row items-center rounded-t-[${radius}] ${BG_SURFACE}`}>
      <Text className={`grow text-sm ${TEXT_MUTED}`} numberOfLines={1}>{r !== null ? tr('discord.composer.replying', ['name', r.author]) : tr('discord.composer.editing')}</Text>
      <Tooltip label={tr('discord.common.cancel')}><View className="p-1" aria-label={tr('discord.common.cancel')} onPress={() => store.cancel()}><Icon name="x" size={16} color={MUTED} /></View></Tooltip>
    </View> : null}
    <CodePanel />
    {isSlack() || isTeams() ? <Boxed field={field} keys={keys} name={p.name} radius={radius} bare={r !== null || ed !== null} /> : <View className={`pr-4 flex-row items-start ${currentTheme().composerBorder ? 'border border-[var(--dc-border)]' : ''} ${r !== null || ed !== null ? `rounded-b-[${radius}]` : rounded()} ${BG_INPUT}`}>
      <Tooltip label={tr('discord.composer.send_files')}><View className="px-4 py-[12]" aria-label={tr('discord.composer.send_files')} onPress={() => { pickFiles(); }}><Icon name="circle-plus" size={20} color={MUTED} /></View></Tooltip>
      <View className="grow basis-0 py-[11]">
        <TextArea ref={field} rows={0} className={`w-full ${textClass()} ${TEXT_MAIN}`} value={store.draft} placeholder={tr('discord.composer.message_to', ['name', p.name])}
          onInput={(v: string) => store.typed(v)} onKeyDown={keys} aria-label={tr('discord.composer.message')} />
      </View>
      <CodeInsert />
      <PickerButtons />
    </View>}
    <Text className={`h-[22] text-xs font-semibold ${TEXT_MAIN}`} numberOfLines={1}>{typing !== '' ? typing : wait}</Text>
  </View>;
}

// The row that was at the top before older messages came: shown at the top again once they are in the list (not a jump to the oldest).
let keepRow: i32 = -1;
let shown: i32 = -1;
/** The history's list node (-1 before it is shown): the bench of main.tsx scrolls it. */
export function historyList(): i32 { return shown; }
let jumped = '';
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
      const ne = e.nativeEvent, now = ne.contentOffset.y;
      if (now < y && now < OLDER_AT) older();
      y = now;
      store.setAtEnd(now + ne.layoutMeasurement.height >= ne.contentSize.height - 4);   // at the end: what comes is read, no banner
    });
  }, []);
  useEffect((): void => {
    if (keepRow >= 0) { ui.scrollToRow(ref.current, keepRow); keepRow = -1; }
    if (store.jumpId !== jumped) {                           // a jump: its message brought into view, once
      jumped = store.jumpId;
      for (let i = 0; i < list.length; i++) if (list[i].id === jumped) ui.scrollToRow(ref.current, i);
    }
  }, null);
  const from = store.newFrom;
  return <VirtualList ref={ref} count={list.length} estimatedItemHeight={ROW_ESTIMATE} className="grow" stickToBottom>
    {(i: i32) => {
      const dated = (isSlack() || isTeams()) && (i === 0 || day(list[i - 1]) !== day(list[i]));   // Slack and Teams divide the days
      const row = <Row key={list[i].id !== '' ? list[i].id : list[i].nonce} m={list[i]} head={dated || i === 0 || list[i - 1].authorId !== list[i].authorId}
        last={i === list.length - 1} />;
      const fresh = from !== '' && list[i].id !== '' && compareIds(list[i].id, from) > 0 && (i === 0 || compareIds(list[i - 1].id, from) <= 0);
      return fresh || dated ? <View key={list[i].id !== '' ? list[i].id : list[i].nonce}>{dated ? <DayLine date={day(list[i])} /> : null}{fresh ? <NewLine /> : null}{row}</View> : row;
    }}
  </VirtualList>;
}

/** Scrolled away from new messages, or showing older ones after a jump: a bar that goes back to the present. */
function Present() {
  const older = store.showingOlder(), n = store.newWhileUp;
  if (!older && (store.atEnd || n === 0)) return null;
  return <View className="mx-4 h-[28] px-3 flex-row items-center rounded-t-lg bg-[var(--dc-accent)]">
    <Text className="grow text-sm font-semibold text-white" numberOfLines={1}>{older ? tr('discord.message.older') : trn('discord.message.new_messages', n)}</Text>
    <Text className="text-sm font-semibold text-white" aria-label={tr('discord.message.jump')}
      onPress={() => { if (!older && shown >= 0) ui.scrollTo(shown, 0, 1e9); store.jumpToPresent(); }}>{tr('discord.message.jump')}</Text>
  </View>;
}

const starred = new Set<string>();

/** Slack's member stack: three small avatars and the count (the server's members, from the list Discord sends). */
function MemberStack() {
  let total = 0;
  for (const r of store.members) if (r.group !== '') total += r.count;
  const users = store.members.filter((r) => r.known && r.group === '').slice(0, 3);
  if (total === 0) return null;
  const label = tr('discord.layout.members', ['count', `${total}`]);
  return <Tooltip label={label}><View className="h-[32] px-2 flex-row items-center gap-1 rounded-[6] border border-[var(--dc-border)]" aria-label={label}>
    <View className="flex-row">{users.map((r, i: i32) => <View key={r.userId} className={`${i > 0 ? '-ml-1.5' : ''} rounded-[5] border-2 border-[var(--dc-main)]`}>
      <Avatar picture={store.avatarOf(r.userId) !== '' ? cdnPicture(avatarKey(r.userId, store.avatarOf(r.userId))) : -1} name={store.userName(r.userId)} size={20} round={false} /></View>)}</View>
    <Text className={`text-sm ${TEXT_MUTED}`}>{`${total}`}</Text>
  </View></Tooltip>;
}

function PinsButton(p: { c: Channel }) {
  return <Tooltip label={tr('discord.pins.title')} placement="bottom-end"><View className={`p-1 rounded ${store.pane === 'pins' ? 'bg-[var(--dc-selected)]' : BG_HOVER}`} aria-label={tr('discord.pins.title')} onPress={() => store.togglePins()}>
    <Icon name="pin" size={20} color={MUTED} />
  </View></Tooltip>;
}

/** The top bar by layout: Discord's name and pins; Slack's name with its star, the topic under it, the member stack; Teams' name, then the tabs row. */
function Header(p: { c: Channel | null; title: string }) {
  const c = p.c;
  if (isSlack()) return <View className="h-[64] px-5 flex-row items-center gap-3 border-b border-[var(--dc-divider)]">
    <BackButton />
    <View className="grow basis-0">
      <View className="flex-row items-center gap-1">
        <Text className={`text-[18px] font-bold ${TEXT_STRONG}`} numberOfLines={1}>{p.title}</Text>
        {c !== null ? <Tooltip label={tr('discord.layout.star')}><View className={`p-1 rounded ${BG_HOVER}`} aria-label={tr('discord.layout.star')}
          onPress={() => { if (starred.has(c.id)) starred.delete(c.id); else starred.add(c.id); store.changed(); }}>
          <Icon name="star" size={16} color={() => c !== null && starred.has(c.id) ? color('warning') : color('icon')} />
        </View></Tooltip> : null}
      </View>
      {c !== null && c.topic !== '' ? <Text className={`text-xs ${TEXT_MUTED}`} numberOfLines={1}>{c.topic}</Text> : null}
    </View>
    {c !== null && c.guildId !== '' ? <MemberStack /> : null}
    {c !== null && !c.forum() ? <PinsButton c={c} /> : null}
  </View>;
  if (isTeams()) return <View className="border-b border-[var(--dc-divider)]">
    <View className="h-[48] px-4 flex-row items-center gap-2">
      <BackButton />
      <Text className={`grow text-[18px] font-bold ${TEXT_STRONG}`} numberOfLines={1}>{p.title}</Text>
      {c !== null && c.guildId !== '' ? <MemberStack /> : null}
    </View>
    {c !== null && !c.forum() ? <View className="h-[36] px-4 flex-row items-center gap-4">
      <Text className={`h-[36] pt-[8] text-sm ${store.pane !== 'pins' ? `font-semibold ${TEXT_STRONG} border-b-2 border-[var(--dc-accent)]` : TEXT_MUTED}`}
        aria-label={tr('discord.layout.tab_posts')} onPress={() => { if (store.pane === 'pins') store.togglePins(); }}>{tr('discord.layout.tab_posts')}</Text>
      <Text className={`h-[36] pt-[8] text-sm ${store.pane === 'pins' ? `font-semibold ${TEXT_STRONG} border-b-2 border-[var(--dc-accent)]` : TEXT_MUTED}`}
        aria-label={tr('discord.pins.title')} onPress={() => { if (store.pane !== 'pins') store.togglePins(); }}>{tr('discord.pins.title')}</Text>
    </View> : null}
  </View>;
  return <View className="h-[48] px-4 flex-row items-center gap-2 border-b border-[var(--dc-divider)]">
    <BackButton />
    <Text className={`grow font-semibold ${TEXT_STRONG}`} numberOfLines={1}>{p.title}</Text>
    {c !== null && !c.forum() ? <PinsButton c={c} /> : null}
  </View>;
}

export function MessageView() {
  const c = store.findChannel(store.channelId);
  const list = store.messages.get(store.channelId);
  const banner = store.stage === 'reconnecting' ? tr('discord.message.reconnecting') : store.stage === 'failed' ? tr('discord.message.disconnected') : '';
  const title = c !== null ? (c.guildId !== '' ? '#' : '@') + c.name : '';
  return <View className={`grow basis-0 ${BG_MAIN}`}>
    <Header c={c} title={title} />
    {banner !== '' ? <Text className="px-4 py-1 text-sm text-white bg-[var(--dc-danger)]">{banner}</Text> : null}
    {store.error !== '' ? <Text className={`px-4 py-1 text-sm ${TEXT_ERROR}`}>{store.error}</Text> : null}
    {c !== null && c.forum() ? <Forum c={c} />
      : list === undefined ? <Text className={`grow p-4 ${TEXT_MUTED}`}>{c === null ? tr('discord.message.no_channel') : tr('discord.common.loading')}</Text> : <History key={store.channelId} list={list} />}
    {c !== null && !c.forum() ? <Present /> : null}
    {c !== null && !c.forum() ? <Composer name={title} /> : null}
    {pickerTab() !== '' && c !== null && !c.forum() ? <Picker /> : null}
  </View>;
}
