// The pickers, over the bottom right of the messages as Discord has them: GIFs (Discord's GIF search, services/gifs.ts: the trending ones,
// then a search when the typing pauses), the stickers of your servers, and emoji (the ones used last, the servers' custom emoji, Unicode's
// by group, a search by name). An emoji goes into the message box, or onto a message as a reaction when the picker was opened from it; a
// GIF or a sticker is sent at once. Custom emoji and stickers of another server than the open one need Nitro, as on Discord.
import { useState, useEffect } from 'zinc:ui/react';
import { Icon } from 'zinc:icons';
import { store, Message, Guild, CustomEmoji } from '../state';
import { Reaction, Sticker, STICKER_LOTTIE, STICKER_GIF } from '../content';
import { emojiGroups, searchEmoji, recentEmoji, usedEmoji, customParts, EmojiGroup } from '../emoji';
import { Gif, gifs } from '../services/gifs';
import { cdnPicture, emojiKey, stickerPicture, urlPicture } from '../services/cdn';
import { BG_SURFACE, BG_INPUT, BG_HOVER, BG_SELECTED, TEXT_MAIN, TEXT_MUTED, TEXT_STRONG, win, mainW } from '../constants';
import { color, rounded } from '../theme';

const W = 420, H = 440, CELL = 42, SEARCH_PAUSE_MS = 400;
// the popover is clamped to the messages' column and the window's height; its emoji per row and GIF width follow
let PER_ROW = 9, GIF_W = 190;
const fit = (): i32 => { const w = Math.max(240, Math.min(W, mainW() - 24)); PER_ROW = Math.max(4, Math.floor((w - 16) / CELL)); GIF_W = Math.floor((w - 28) / 2); return w; };

class PickerState { tab = ''; target: Message | null = null; }
const state = new PickerState();
/** Opens a picker ('emoji', 'gif', 'sticker'); `target`: the message an emoji reacts to (null: the message box). Again: closes it. */
export function openPicker(tab: string, target: Message | null): void {
  state.tab = state.tab === tab && state.target === target ? '' : tab;
  state.target = target;
  store.changed();
}
export function closePicker(): void { state.tab = ''; state.target = null; store.changed(); }
export function pickerTab(): string { return state.tab; }

/** The servers whose emoji and stickers can be used here: the open one, or every server with Nitro. */
function usable(): Guild[] { return store.call.nitro ? store.shownGuilds() : store.guilds.filter((g: Guild) => g.id === store.guildId); }
const customOf = (e: CustomEmoji): string => `<${e.animated ? 'a' : ''}:${e.name}:${e.id}>`;

/** Picks an emoji: a reaction on the target message, or text in the message box. */
export function pickEmoji(e: string): void {
  usedEmoji(e);
  const m = state.target, c = customParts(e);
  if (m !== null) {
    const r = new Reaction();
    if (c !== null) { r.id = c[0]; r.name = c[1]; } else r.name = e;
    closePicker();
    store.react(m, r);
    return;
  }
  store.insert(e);
}

function EmojiCell(p: { e: string }) {
  const c = customParts(p.e);
  return <View className={`w-[${CELL}] h-[${CELL}] items-center justify-center rounded ${BG_HOVER}`} aria-label={c !== null ? `:${c[1]}:` : p.e} onPress={() => pickEmoji(p.e)}>
    {c !== null ? <Image image={cdnPicture(emojiKey(c[0]))} className="w-[28] h-[28] object-contain" /> : <Text className="text-[26px]">{p.e}</Text>}
  </View>;
}

/** The emoji as rows: a heading, then its emoji PER_ROW at a time. */
class EmojiRow { heading = ''; items: string[] = []; }
function emojiRows(query: string): EmojiRow[] {
  const rows: EmojiRow[] = [];
  const add = (heading: string, items: string[]): void => {
    if (items.length === 0) return;
    const h = new EmojiRow(); h.heading = heading; rows.push(h);
    for (let i = 0; i < items.length; i += PER_ROW) { const r = new EmojiRow(); r.items = items.slice(i, i + PER_ROW); rows.push(r); }
  };
  const q = query.trim().toLowerCase();
  if (q !== '') {
    const custom: string[] = [];
    for (const g of usable()) for (const e of g.emojis) if (e.name.toLowerCase().indexOf(q) >= 0) custom.push(customOf(e));
    add('Results', custom.concat(searchEmoji(q, 90)));
    return rows;
  }
  add('Recent', recentEmoji());
  for (const g of usable()) add(g.name, g.emojis.map(customOf));
  for (const g of emojiGroups()) add(g.name, g.chars);
  return rows;
}

function Emojis(p: { query: string }) {
  const rows = emojiRows(p.query);
  if (rows.length === 0) return <Text className={`p-4 text-sm ${TEXT_MUTED}`}>No emoji found.</Text>;
  return <VirtualList count={rows.length} estimatedItemHeight={CELL} className="grow">
    {(i: i32) => rows[i].heading !== ''
      ? <Text key={`h${i}`} className={`px-2 pt-2 pb-1 text-xs font-bold uppercase ${TEXT_MUTED}`}>{rows[i].heading}</Text>
      : <View key={`r${i}`} className="px-1 flex-row">{rows[i].items.map((e: string) => <EmojiCell key={e} e={e} />)}</View>}
  </VirtualList>;
}

function Stickers() {
  const list: Sticker[] = [];
  for (const g of usable()) for (const s of g.stickers) if (s.format !== STICKER_LOTTIE) list.push(s);
  if (list.length === 0) return <Text className={`p-4 text-sm ${TEXT_MUTED}`}>No stickers in this server.</Text>;
  return <ScrollView className="grow"><View className="p-2 flex-row flex-wrap gap-2">
    {list.map((s: Sticker) => <View key={s.id} className={`p-1 rounded ${BG_HOVER}`} aria-label={`Sticker ${s.name}`} onPress={() => { closePicker(); store.sendSticker(s); }}>
      <Image image={stickerPicture(s.id, s.format === STICKER_GIF)} className="w-[88] h-[88] object-contain" />
    </View>)}
  </View></ScrollView>;
}

/** The GIFs of the query: asked once the typing pauses, each query once (gifs() keeps the answers). */
function Gifs(p: { query: string; edits: i32 }) {
  const [shown, setShown] = useState<Gif[]>([]);
  const [error, setError] = useState<string>('');
  useEffect((): (() => void) => {
    const t = setTimeout(() => {
      gifs(p.query).then((l: Gif[]) => { setShown(l); setError(''); }).catch((e: Error) => { setError(`Could not load the GIFs: ${e.message}`); });
    }, p.query === '' ? 0 : SEARCH_PAUSE_MS);
    return (): void => { clearTimeout(t); };
  }, [p.edits]);   // each edit of the search waits for the next pause
  if (error !== '') return <Text className={`p-4 text-sm ${TEXT_MUTED}`}>{error}</Text>;
  const col = (k: i32): Gif[] => shown.filter((g: Gif, i: i32) => i % 2 === k);
  return <ScrollView className="grow"><View className="p-2 flex-row gap-2">
    <View>{col(0).map((g: Gif) => <GifCell key={g.id} g={g} />)}</View><View>{col(1).map((g: Gif) => <GifCell key={g.id} g={g} />)}</View>
  </View></ScrollView>;
}

function GifCell(p: { g: Gif }) {
  const g = p.g, h = g.width > 0 ? Math.round(g.height * GIF_W / g.width) : GIF_W;
  return <View className="mb-2 rounded overflow-hidden" aria-label={`GIF ${g.title}`} onPress={() => { closePicker(); store.sendLink(g.url); }}>
    <Image image={urlPicture(g.preview)} className={`w-[${GIF_W}] h-[${h}] bg-[var(--dc-rail)] object-cover`} />
  </View>;
}

function Tab(p: { id: string; label: string }) {
  const on = state.tab === p.id;
  return <View className={`px-3 h-[28] justify-center rounded ${on ? BG_SELECTED : BG_HOVER}`} aria-label={p.label} onPress={() => { state.tab = p.id; store.changed(); }}>
    <Text className={`text-sm font-semibold ${on ? TEXT_STRONG : TEXT_MUTED}`}>{p.label}</Text>
  </View>;
}

export function Picker() {
  const [query, setQuery] = useState<string>('');
  const [edits, setEdits] = useState<i32>(0);
  const tab = state.tab;
  return <View className={`absolute right-4 bottom-[64] w-[${fit()}] h-[${Math.max(220, Math.min(H, win.h - 150))}] ${rounded()} border border-[var(--dc-border)] ${BG_SURFACE}`}>
    <View className="p-2 gap-2">
      <View className="flex-row gap-1">
        {state.target === null ? <Tab id="gif" label="GIFs" /> : null}
        {state.target === null ? <Tab id="sticker" label="Stickers" /> : null}
        <Tab id="emoji" label="Emoji" />
        <View className="grow" />
        <View className="p-1" aria-label="Close" onPress={() => closePicker()}><Icon name="x" size={16} color={() => color('muted')} /></View>
      </View>
      {tab !== 'sticker' ? <Input className={`w-full h-[32] px-2 rounded border-0 ${BG_INPUT} ${TEXT_MAIN}`} value={query} onInput={(v: string) => { setQuery(v); setEdits(edits + 1); }}
        placeholder={tab === 'gif' ? 'Search Tenor' : 'Find the perfect emoji'} aria-label="Search" /> : null}
    </View>
    {tab === 'gif' ? <Gifs query={query} edits={edits} /> : tab === 'sticker' ? <Stickers /> : <Emojis query={query} />}
  </View>;
}

/** The message box's buttons: GIFs, stickers, emoji. */
export function PickerButtons() {
  const tint = (t: string) => (): i32 => state.tab === t && state.target === null ? color('strong') : color('icon');
  return <View className="flex-row items-center">
    <View className="px-1.5 py-[12]" aria-label="GIFs" onPress={() => openPicker('gif', null)}>
      <Text className={`px-1 rounded border-2 text-[10px] font-bold ${state.tab === 'gif' ? TEXT_STRONG : TEXT_MUTED} border-[var(--dc-icon)]`}>GIF</Text>
    </View>
    <View className="px-1.5 py-[12]" aria-label="Stickers" onPress={() => openPicker('sticker', null)}><Icon name="sticker" size={20} color={tint('sticker')} /></View>
    <View className="px-1.5 py-[12]" aria-label="Emoji" onPress={() => openPicker('emoji', null)}><Icon name="face-slightly-smiling" size={20} color={tint('emoji')} /></View>
  </View>;
}
