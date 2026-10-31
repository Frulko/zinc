// What a message shows under its text (docs/reports/discord-message-content.md): its files by kind (pictures, videos, sounds, voice
// messages, other files, spoilers), stickers, embeds (link previews, rich cards, GIFs and videos as their picture with a play mark), a
// poll, rows of buttons and menus (drawn only: pressing one would send an interaction, a bot's request), its thread and its reactions.
// Pictures come from Discord's media proxy at the size drawn (services/cdn.ts); GIFs and animated stickers play while shown (Animated.tsx);
// a video or a link opens in the browser.
import { Icon } from 'zinc:icons';
import { useRef, useEffect } from 'zinc:ui/react';
import { openUrl } from 'zinc:system/opener';
import { store, Message, Attachment } from '../state';
import { Embed, EmbedField, EmbedMedia, Reaction, Sticker, PollAnswer, Component, STICKER_LOTTIE, STICKER_GIF, F_SUPPRESS_EMBEDS,
  sizeText, waveform } from '../content';
import { Markdown } from './Markdown';
import { cdnPicture, emojiKey, attachmentPicture, attachmentKey, mediaPicture, mediaFailed, attachmentFailed, stickerPicture, urlPicture } from '../services/cdn';
import { BG_SURFACE, TEXT_MAIN, TEXT_MUTED, TEXT_STRONG, TEXT_LINK, MEDIA_MAX_W, MEDIA_MAX_H, EMBED_W, THUMB, STICKER, CDN_BASE, mainW, paneW } from '../constants';
import { Animated } from './Animated';
import { thumbs, Thumb, openViewer } from './Viewer';
import { color } from '../theme';

const LINK = (): i32 => color('link');
/** The width a card may take: the messages' column, or the pane's when the message is read there. */
const colW = (): i32 => store.pane !== 'members' ? paneW() - 90 : mainW() - 100;
const WHITE = (): i32 => 0xffffff;
const MUTED = (): i32 => color('icon');
const open = (url: string): void => { if (url !== '') openUrl(url); };
const GIF_MAX = 8 * 1024 * 1024;   // ponytail: a GIF attachment larger than this stays still (its frames would weigh too much)
const STICKER_APNG = 2;
/** A Tenor GIF's own .gif from the still picture of its embed (Tenor names its renditions by the end of the id: AAAAe a PNG, AAAAC the GIF). */
export function tenorGif(still: string): string {
  const m = /media\.tenor\.com\/([A-Za-z0-9_-]+)AAAAe\/([^?\/]+)\.png/.exec(still);   // also inside a media proxy's URL
  return m !== null ? `https://media.tenor.com/${m[1]}AAAAC/${m[2]}.gif` : '';
}
const hex = (rgb: i32): string => { const s = rgb.toString(16); return '0'.repeat(6 - s.length) + s; };

/** w x h fitted in maxW x maxH, keeping the shape (a picture of unknown size takes a 16:9 box). */
class Box { w: i32 = 0; h: i32 = 0; }
function fit(w: i32, h: i32, maxW: i32, maxH: i32): Box {
  const b = new Box();
  const sw = w > 0 && h > 0 ? w : 16, sh = w > 0 && h > 0 ? h : 9;
  b.w = Math.min(w > 0 ? w : maxW, maxW); b.h = Math.round(sh * b.w / sw);
  if (b.h > maxH) { b.h = maxH; b.w = Math.round(sw * b.h / sh); }
  return b;
}

/** A play mark over a picture (a video, a GIF to open). */
function Play(p: { w: i32; h: i32 }) {
  return <View className={`absolute left-0 top-0 w-[${p.w}] h-[${p.h}] items-center justify-center`}>
    <View className="w-[48] h-[48] rounded-full bg-[#000000]/60 items-center justify-center"><Icon name="play" size={24} color={WHITE} /></View>
  </View>;
}

/** A picture hidden behind "SPOILER" until clicked. */
function Spoiler(p: { w: i32; h: i32; m: Message }) {
  return <View className={`mt-1 w-[${p.w}] h-[${p.h}] rounded-lg bg-[var(--dc-rail)] items-center justify-center`} aria-label="Spoiler" onPress={() => store.revealSpoilers(p.m)}>
    <Text className="px-3 py-1 rounded-full bg-[#000000]/60 text-sm font-bold text-white">SPOILER</Text>
  </View>;
}

function FileCard(p: { a: Attachment; icon: string }) {
  const a = p.a;
  return <View className={`mt-1 self-start px-3 py-2 flex-row items-center gap-2 rounded-lg border border-[var(--dc-border)] ${BG_SURFACE}`} onPress={() => open(a.url)}>
    <Icon name={p.icon} size={24} color={LINK} />
    <View>
      <Text className="text-sm text-[var(--dc-link)]">{a.filename}</Text>
      <Text className={`text-xs ${TEXT_MUTED}`}>{a.url === '' ? 'sending…' : sizeText(a.size)}</Text>
    </View>
  </View>;
}

const clock = (s: number): string => { const n = Math.round(s); return `${Math.floor(n / 60)}:${n % 60 < 10 ? '0' : ''}${n % 60}`; };
const BARS = 40;

/** A voice message: a play button, its waveform and its length (played in the browser: the app does not decode Opus yet). */
function Voice(p: { a: Attachment }) {
  const a = p.a;
  return <View className="mt-1 self-start h-[48] px-3 flex-row items-center gap-3 rounded-full bg-[var(--dc-surface)]" aria-label="Voice message" onPress={() => open(a.url)}>
    <View className="w-[32] h-[32] rounded-full bg-[var(--dc-accent)] items-center justify-center"><Icon name="play" size={16} color={WHITE} /></View>
    <View className="h-[28] flex-row items-center gap-[2]">
      {waveform(a.waveform, BARS).map((v: number, i: i32) => <View key={`${i}`} className={`w-[3] h-[${4 + Math.round(v * 22)}] rounded-full bg-[var(--dc-icon)]`} />)}
    </View>
    <Text className={`text-sm ${TEXT_MAIN}`}>{clock(a.duration)}</Text>
  </View>;
}

/** A file of a message: a picture at its own size within 400 x 300 (its box is known before it loads, so nothing moves when it comes), a
 *  video as its first frame, a sound or another file as a card with its size. */
export function Media(p: { a: Attachment; m: Message }) {
  const a = p.a;
  const ref = useRef<i32>(-1), tkey = `${p.m.id}/${a.id}`;
  if (!thumbs.has(tkey)) thumbs.set(tkey, new Thumb(ref));
  useEffect((): (() => void) => (): void => { thumbs.delete(tkey); }, []);   // the row leaves the screen (a virtual list): its picture is not there to grow from
  if (a.kind === 'voice') return <Voice a={a} />;
  if (a.kind === 'audio') return <FileCard a={a} icon="music" />;
  if (a.kind === 'video' || a.image()) {
    const b = fit(a.width, a.height, Math.min(MEDIA_MAX_W, colW() - 20), MEDIA_MAX_H);
    if (a.spoiler && !store.revealed.has(p.m.id)) return <Spoiler w={b.w} h={b.h} m={p.m} />;
    const picture = a.proxyUrl !== '' ? mediaPicture(a.proxyUrl, b.w, b.h) : a.kind === 'image' ? attachmentPicture(a.url) : -1;
    const alt = a.description !== '' ? a.description : a.filename;
    const th = thumbs.get(tkey); if (th !== undefined) th.picture = picture;
    const cls = `mt-1 w-[${b.w}] h-[${b.h}] rounded-lg bg-[var(--dc-surface)] object-cover`;
    const view = (): void => { if (a.kind === 'image' && picture >= 0) openViewer(p.m, a, picture); };
    if (a.kind === 'image' && a.filename.toLowerCase().endsWith('.gif') && a.size <= GIF_MAX)
      return <Animated file={attachmentKey(a.url)} url={a.url} still={picture} w={b.w} h={b.h} className={cls} label={alt} />;
    const failed = a.proxyUrl !== '' ? mediaFailed(a.proxyUrl, b.w, b.h) : attachmentFailed(a.url);
    if (failed && picture < 0) return <View className={`${cls} items-center justify-center gap-1`} aria-label={`${alt}, could not load`} onPress={() => open(a.url)}>
      <Icon name="image-off" size={24} color={MUTED} /><Text className={`text-xs ${TEXT_MUTED}`}>Could not load the picture</Text>
    </View>;
    if (a.kind === 'image') return <Image ref={ref} image={picture} className={`${cls} ${picture >= 0 ? 'cursor-pointer' : ''}`} aria-label={alt} onPress={view} />;
    return <View className={`mt-1 w-[${b.w}] h-[${b.h}] rounded-lg bg-[#000000]`} aria-label={alt} onPress={() => open(a.url)}>
      <Image image={picture} className={`w-[${b.w}] h-[${b.h}] rounded-lg object-cover`} />
      <Play w={b.w} h={b.h} />
    </View>;
  }
  return <FileCard a={a} icon="file" />;
}

/** A sticker: its picture at 160 px; a Lottie one (an animation the app does not play yet) as its name. */
function StickerView(p: { s: Sticker }) {
  const s = p.s;
  if (s.format === STICKER_LOTTIE) return <View className={`mt-1 self-start px-3 py-2 flex-row items-center gap-2 rounded-lg ${BG_SURFACE}`}>
    <Icon name="sticker" size={18} color={MUTED} /><Text className={`text-sm ${TEXT_MUTED}`}>{`:${s.name}:`}</Text>
  </View>;
  const gif = s.format === STICKER_GIF, still = stickerPicture(s.id, gif), cls = `mt-1 w-[${STICKER}] h-[${STICKER}] object-contain`;
  if (gif || s.format === STICKER_APNG) {
    const key = `stickers/${s.id}.${gif ? 'gif' : 'png'}`;
    return <Animated file={key} url={`${CDN_BASE}/${key}?size=${STICKER}`} still={still} w={STICKER} h={STICKER} className={cls} label={s.name} />;
  }
  return <Image image={still} className={cls} aria-label={s.name} />;
}

/** An embed's picture: drawn large, with a play mark when it stands for a video or a GIF (which open in the browser). */
function EmbedPicture(p: { media: EmbedMedia; video: boolean; url: string; maxW: i32 }) {
  const b = fit(p.media.width, p.media.height, p.maxW, MEDIA_MAX_H);
  const cls = `w-[${b.w}] h-[${b.h}] rounded bg-[var(--dc-rail)] object-cover`, still = mediaPicture(p.media.url, b.w, b.h), gif = tenorGif(p.media.url);
  if (gif !== '') return <View className="mt-2" aria-label="GIF"><Animated file={`tenor/${gif.split('/').slice(3).join('_')}`} url={gif} still={still} w={b.w} h={b.h} className={cls} label="GIF" /></View>;
  const img = <Image image={still} className={cls} />;
  if (!p.video) return <View className="mt-2">{img}</View>;
  return <View className={`mt-2 w-[${b.w}] h-[${b.h}]`} aria-label="Play" onPress={() => open(p.url)}>{img}<Play w={b.w} h={b.h} /></View>;
}

function Field(p: { f: EmbedField }) {
  return <View className={p.f.inline ? 'w-[128]' : 'w-full'}>
    <Text className={`text-[13px] font-semibold ${TEXT_STRONG}`}>{p.f.name}</Text>
    <Markdown text={p.f.value} revealed={true} size="text-[13px]" />
  </View>;
}

const field = (e: Embed, name: string): string => { for (const f of e.fields) if (f.name === name) return f.value; return ''; };
/** The end of a poll (message type 46): who won. */
function PollResult(p: { e: Embed }) {
  const e = p.e, votes = parseInt(field(e, 'victor_answer_votes')), total = parseInt(field(e, 'total_votes'));
  const won = field(e, 'victor_answer_text');
  return <View className={`mt-1 self-start w-full max-w-[${Math.min(EMBED_W, colW())}] px-4 py-3 flex-row items-center gap-3 rounded-lg border border-[var(--dc-border)] ${BG_SURFACE}`}>
    <Icon name="chart-bar" size={24} color={MUTED} />
    <View className="grow basis-0">
      <Text className={`text-[15px] font-semibold ${TEXT_STRONG}`}>{`${field(e, 'poll_question_text')}: the poll has closed`}</Text>
      <Text className={`text-sm ${TEXT_MUTED}`}>{won !== '' ? `${won} won with ${votes} vote${votes === 1 ? '' : 's'} (${total > 0 ? Math.round(votes * 100 / total) : 0}%)` : 'No votes'}</Text>
    </View>
  </View>;
}

/** A link preview or a bot's card: the colour bar, provider, author, title (a link), description, fields, thumbnail on the right, the
 *  large picture, the footer; a GIF or an image link is its picture alone, a video its picture with a play mark. */
function EmbedCard(p: { e: Embed }) {
  const e = p.e;
  if (e.type === 'poll_result') return <PollResult e={e} />;
  const pic = e.picture();
  if (e.pictureOnly()) return pic !== null ? <View className="self-start"><EmbedPicture media={pic} video={e.type === 'gifv'} url={e.url} maxW={Math.min(MEDIA_MAX_W, colW() - 20)} /></View> : null;
  const thumb = e.image === null && e.type !== 'video' ? e.thumbnail : null;
  return <View className={`mt-1 self-start max-w-[${Math.min(EMBED_W, colW())}] flex-row rounded ${BG_SURFACE}`}>
    <View className={`w-[4] rounded-l bg-[#${e.color >= 0 ? hex(e.color) : '1e1f22'}]`} />
    <View className="shrink px-3 pt-2 pb-3">
      <View className="flex-row gap-3">
        <View className="shrink gap-1">
          {e.provider !== '' ? <Text className={`text-xs ${TEXT_MUTED}`}>{e.provider}</Text> : null}
          {e.author !== '' ? <Text className={`text-sm font-semibold ${TEXT_STRONG}`}>{e.author}</Text> : null}
          {e.title !== '' ? <Text className={`text-[15px] font-semibold ${e.url !== '' ? 'text-[var(--dc-link)]' : TEXT_STRONG}`} onPress={() => open(e.url)}>{e.title}</Text> : null}
          {e.description !== '' ? <Markdown text={e.description} revealed={true} size="text-sm" /> : null}
          {e.fields.length > 0 ? <View className="mt-1 flex-row flex-wrap gap-x-2 gap-y-2">{e.fields.map((f: EmbedField, i: i32) => <Field key={`${i}`} f={f} />)}</View> : null}
        </View>
        {thumb !== null ? <Image image={mediaPicture(thumb.url, THUMB, THUMB)} className={`mt-1 w-[${THUMB}] h-[${THUMB}] rounded object-cover`} /> : null}
      </View>
      {pic !== null ? <EmbedPicture media={pic} video={e.type === 'video'} url={e.url} maxW={Math.min(EMBED_W, colW()) - 32} /> : null}
      {e.footer !== '' || e.timestamp !== '' ? <Text className={`mt-2 text-xs ${TEXT_MUTED}`}>{[e.footer, e.timestamp.slice(0, 10)].filter((s: string) => s !== '').join(' • ')}</Text> : null}
    </View>
  </View>;
}

const left = (expiry: string): string => {
  const ms = Date.parse(expiry) - Date.now();
  if (!(ms > 0)) return 'Poll closed';
  const h = Math.floor(ms / 3600000);
  return h >= 24 ? `${Math.floor(h / 24)}d left` : h >= 1 ? `${h}h left` : `${Math.max(1, Math.floor(ms / 60000))}m left`;
};
/** A poll: the question, an answer per row (pressed: my vote, again: taken back), and once voted or ended the share of each. */
function PollView(p: { m: Message }) {
  const m = p.m, poll = m.poll;
  if (poll === null) return null;
  const total = poll.total(), shown = poll.voted() || poll.finalized, closed = poll.finalized || left(poll.expiry) === 'Poll closed';
  return <View className={`mt-1 w-full max-w-[${Math.min(EMBED_W, colW())}] p-4 gap-2 rounded-lg border border-[var(--dc-border)] ${BG_SURFACE}`}>
    <Text className={`text-[17px] font-semibold ${TEXT_STRONG}`}>{poll.question}</Text>
    <Text className={`text-sm ${TEXT_MUTED}`}>{poll.multi ? 'Select one or more answers' : 'Select one answer'}</Text>
    {poll.answers.map((a: PollAnswer) => {
      const pct = total > 0 ? Math.round(a.count * 100 / total) : 0;
      return <View key={`${a.id}`} className={`h-[44] rounded-lg border ${a.mine ? 'border-[var(--dc-accent)]' : 'border-[var(--dc-input)]'} bg-[var(--dc-input)]`}
        aria-label={a.text} onPress={() => { if (!closed) store.vote(m, a.id); }}>
        {shown ? <View className={`absolute left-0 top-0 bottom-0 w-[${pct}%] rounded-lg ${a.mine ? 'bg-[var(--dc-accent-soft)]' : 'bg-[var(--dc-faint)]'}`} /> : null}
        <View className="grow px-3 flex-row items-center gap-2">
          {a.emojiId !== '' ? <Image image={cdnPicture(emojiKey(a.emojiId))} className="w-[20] h-[20]" /> : a.emoji !== '' ? <Text className="text-[16px]">{a.emoji}</Text> : null}
          <Text className={`grow basis-0 text-[15px] font-semibold ${TEXT_MAIN}`} numberOfLines={1}>{a.text}</Text>
          {shown ? <Text className={`text-sm font-semibold ${TEXT_STRONG}`}>{`${a.count} • ${pct}%`}</Text>
            : <View className={`w-[20] h-[20] rounded-full border-2 border-[var(--dc-icon)]`} />}
        </View>
      </View>;
    })}
    <Text className={`text-xs ${TEXT_MUTED}`}>{`${total} vote${total === 1 ? '' : 's'} • ${poll.finalized ? 'Poll closed' : left(poll.expiry)}`}</Text>
  </View>;
}

const STYLE_BG = ['bg-[var(--dc-faint)]', 'bg-[var(--dc-accent)]', 'bg-[var(--dc-faint)]', 'bg-[#248046]', 'bg-[var(--dc-danger)]', 'bg-[var(--dc-faint)]', 'bg-[var(--dc-faint)]'];
/** A button or a menu of a bot's message. Only a link button does something (it opens its page): the others would send an interaction,
 *  which a user client must not fake. */
function Control(p: { c: Component }) {
  const c = p.c;
  if (c.type !== 2) return <View className={`w-full max-w-[${Math.min(EMBED_W, colW()) - 32}] h-[40] px-3 flex-row items-center rounded border border-[var(--dc-border)] bg-[var(--dc-rail)] ${c.disabled ? 'opacity-50' : ''}`} aria-label={c.label}>
    <Text className={`grow text-[15px] ${TEXT_MUTED}`} numberOfLines={1}>{c.label}</Text>
    <Icon name="chevron-down" size={18} color={MUTED} />
  </View>;
  return <View className={`h-[32] px-4 flex-row items-center gap-2 rounded ${STYLE_BG[c.style >= 0 && c.style < STYLE_BG.length ? c.style : 2]} ${c.disabled ? 'opacity-50' : ''}`}
    aria-label={c.label} onPress={() => { if (c.style === 5) open(c.url); }}>
    {c.emoji !== '' ? <Text className="text-[15px]">{c.emoji}</Text> : null}
    <Text className="text-sm font-medium text-white">{c.label}</Text>
    {c.style === 5 ? <Icon name="external-link" size={14} color={WHITE} /> : null}
  </View>;
}

/** A reaction: its emoji and count, mine outlined; a press adds mine or takes it back. */
function ReactionPill(p: { r: Reaction; m: Message }) {
  const r = p.r;
  return <View className={`h-[26] px-[6] flex-row items-center gap-1 rounded-lg border ${r.me ? 'bg-[var(--dc-accent-soft)] border-[var(--dc-accent)]' : 'bg-[var(--dc-surface)] border-[var(--dc-sidebar)]'}`}
    aria-label={`${r.name} ${r.count}`} onPress={() => store.react(p.m, r)}>
    {r.id !== '' ? <Image image={cdnPicture(emojiKey(r.id))} className="w-[16] h-[16]" /> : <Text className="text-[14px]">{r.name}</Text>}
    <Text className={`text-sm font-semibold ${r.me ? 'text-[var(--dc-accent-soft-text)]' : TEXT_MUTED}`}>{`${r.count}`}</Text>
  </View>;
}

/** Everything of a message but its text: files, stickers, embeds, poll, buttons, thread, reactions. */
export function Content(p: { m: Message }) {
  const m = p.m, t = m.thread;
  return <View>
    {m.attachments.map((a: Attachment, i: i32) => <Media key={`${i}`} a={a} m={m} />)}
    {m.stickers.map((s: Sticker, i: i32) => <StickerView key={`${i}`} s={s} />)}
    {(m.flags & F_SUPPRESS_EMBEDS) === 0 ? m.embeds.map((e: Embed, i: i32) => <EmbedCard key={`${i}`} e={e} />) : null}
    {m.poll !== null ? <PollView m={m} /> : null}
    {m.rows.map((row: Component[], i: i32) => <View key={`${i}`} className="mt-1 flex-row flex-wrap gap-2">{row.map((c: Component, k: i32) => <Control key={`${k}`} c={c} />)}</View>)}
    {t !== null ? <View className={`mt-1 self-start px-3 py-2 flex-row items-center gap-2 rounded-lg ${BG_SURFACE}`} aria-label={`Thread ${t.name}`} onPress={() => store.openThread(t.id)}>
      <Icon name="message-square" size={16} color={MUTED} />
      <Text className={`text-sm font-semibold ${TEXT_STRONG}`}>{t.name}</Text>
      <Text className="text-sm text-[var(--dc-link)]">{`${t.count} message${t.count === 1 ? '' : 's'}`}</Text>
    </View> : null}
    {m.reactions.length > 0 ? <View className="mt-1 flex-row flex-wrap gap-1">{m.reactions.map((r: Reaction, i: i32) => <ReactionPill key={`${i}`} r={r} m={m} />)}</View> : null}
  </View>;
}
