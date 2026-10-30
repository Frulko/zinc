// For you, as Spotify's home: shelves of cards worked out from the listening history (forYou.ts, services/forYou.ts). Each shelf
// scrolls sideways (the trackpad, or its ‹ › buttons) and keeps its offset per entry of the history, as the page keeps its own. A draft
// card opens its list on the Playlists page (Play, Save to iPod) and its play button plays it at once; an album, a playlist or an
// artist opens its page; Your year opens the year in review. Until the shelves are read or worked out, grey cards hold their place
// and breathe, and the header turns a ring (components/Working.tsx);
// without a history the page invites to import one, and with few listens found on this iPod it says how many. The mood mixer
// (MoodMixer) closes the page.
import * as ui from 'zinc:ui';
import { createEffect, createMemo, createNodeRef } from 'zinc:ui/solid';
import { Icon } from 'zinc:icons';
import { Album, albums, library, showPage, scrollKey } from '../../state';
import { historyVersion } from '../../services/historyJobs';
import { Card, Shelf } from '../../services/forYou';
import { ForYouData, forYou, working, refreshForYou, jumpCards, openCard, playCard, albumOf, artistOf, shelfSnap, shelfScrollbar } from '../../forYou';
import { deepNote } from '../../deep';
import { geniusCards } from '../../drafts';
import { AlbumCover } from '../../components/AlbumCover';
import { Button } from '../../components/Button';
import { MoodMixer } from './MoodMixer';
import { Working, breathe } from '../../components/Working';
import { bg, bd, fg, color, CARD, BORDER, HOVER, TEXT, MUTED, ACCENT, TRACK, SHELF_CARD_SIZE, PAGE_SETTINGS, PAGE_YEAR } from '../../constants';

/** The album of each song of the open iPod. */
const albumOfTrack = createMemo<Map<string, Album>>(() => {
  const out = new Map<string, Album>();
  for (const a of albums()) for (const t of a.tracks) out.set(t.id, a);
  return out;
}, new Map<string, Album>());

/** Up to four albums of a card's songs (its picture). */
function albumsOf(c: Card): Album[] {
  const out: Album[] = [];
  if (c.kind === 'album') { const a = albumOf(c.id); if (a !== null) out.push(a as Album); return out; }
  if (c.kind === 'artist') { const a = artistOf(c.id); if (a !== null && a.albums.length > 0) out.push(a.albums[0]); return out; }
  const map = albumOfTrack();
  for (const id of c.tracks) {
    const a = map.get(id);
    if (a !== undefined && (a as Album).coverTrack !== '' && out.indexOf(a as Album) < 0) out.push(a as Album);
    if (out.length >= 4) break;
  }
  return out;
}

/** A card's picture: four covers of its albums in a square, else one, else a tinted square with an icon. */
function Picture(props: { c: Card }): i32 {
  const list = albumsOf(props.c), size = SHELF_CARD_SIZE, half = SHELF_CARD_SIZE / 2;
  if (list.length >= 4) return <View className={`flex-col rounded-[8] overflow-hidden ${bg(TRACK)}`} style={{ width: size, height: size }}>
    <View className="flex-row"><AlbumCover album={list[0]} size={half} /><AlbumCover album={list[1]} size={half} /></View>
    <View className="flex-row"><AlbumCover album={list[2]} size={half} /><AlbumCover album={list[3]} size={half} /></View>
  </View>;
  if (list.length > 0) return <AlbumCover album={list[0]} size={size} />;
  return <View className={`items-center justify-center rounded-[8] ${bg(TRACK)}`} style={{ width: size, height: size }}>
    {props.c.kind === 'artist' ? <Icon name="mic-vocal" size={40} color={() => color(MUTED)} strokeWidth={1.5} />
      : props.c.kind === 'year' ? <Icon name="calendar-heart" size={40} color={() => color(MUTED)} strokeWidth={1.5} />
      : <Icon name="music" size={40} color={() => color(MUTED)} strokeWidth={1.5} />}
  </View>;
}

function CardTile(props: { c: Card }): i32 {
  const c = props.c;
  const artist = c.kind === 'artist';
  const away = artist && artistOf(c.id) === null;   // heard, but not on this iPod
  return <View className={`flex-col gap-2 p-2 rounded-[10] shrink-0 snap-start ${away ? '' : `cursor-pointer hover:${bg(HOVER)}`}`} style={{ width: SHELF_CARD_SIZE + 16 }}
    onClick={() => { if (!away) openCard(c); }}>
    <View className={artist ? 'rounded-full overflow-hidden' : ''} style={{ width: SHELF_CARD_SIZE, height: SHELF_CARD_SIZE, opacity: away ? 0.5 : 1 }}>
      <Picture c={c} />
      {c.kind === 'draft' ? <View className={`absolute right-2 bottom-2 w-[34] h-[34] rounded-full items-center justify-center cursor-pointer ${bg(ACCENT)}`}
        onClick={() => playCard(c)}>
        <Icon name="play" size={16} color={() => 0xffffff} strokeWidth={2.5} />
      </View> : <View />}
    </View>
    <View className="flex-col">
      <Text className={`text-[13px] font-semibold ${fg(away ? MUTED : TEXT)}`} numberOfLines={1}>{c.title}</Text>
      <Text className={`text-[12px] ${fg(MUTED)}`} numberOfLines={2}>{away ? `${c.subtitle} · not on this iPod` : c.subtitle}</Text>
    </View>
  </View>;
}

function Arrow(props: { left: boolean; onPress: () => void }): i32 {
  return <View className={`w-[26] h-[26] rounded-full items-center justify-center cursor-pointer border ${bg(CARD)} ${bd(BORDER)} hover:${bg(HOVER)}`}
    onPointerDown={(e: ui.PointerEvent) => { props.onPress(); }}>
    {props.left ? <Icon name="chevron-left" size={15} color={() => color(TEXT)} strokeWidth={2} /> : <Icon name="chevron-right" size={15} color={() => color(TEXT)} strokeWidth={2} />}
  </View>;
}

function ShelfRow(props: { shelf: Shelf; cards: Card[] }): i32 {
  const row = createNodeRef();
  // an arrow turns the shelf by the cards it shows whole, so the first card lands at the shelf's start
  const turn = (dir: number): void => {
    if (row.node < 0) return;
    const step = SHELF_CARD_SIZE + 16 + 4;   // a card and the gap
    const shown = Math.max(1, Math.floor((ui.screenBox(row.node)[2] - 64) / step));
    ui.scrollTo(row.node, Math.max(0, (Math.round(ui.scrollLeft(row.node) / step) + dir * shown) * step), 0, true);
  };
  return <View className="flex-col gap-2 pb-5">
    <View className="flex-row items-center gap-2 px-10">
      <Text className={`grow text-[19px] font-bold ${fg(TEXT)}`} numberOfLines={1}>{props.shelf.title}</Text>
      <Arrow left={true} onPress={() => turn(-1)} />
      <Arrow left={false} onPress={() => turn(1)} />
    </View>
    <View ref={row} className={`flex-row gap-1 px-8 overflow-x-auto ${shelfSnap() ? 'snap-x snap-mandatory' : 'snap-none'}`}
      showsHorizontalScrollIndicator={shelfScrollbar()} dragToScroll scrollKey={scrollKey(`foryou:${props.shelf.id}`)}>
      {props.cards.map((c: Card) => <CardTile c={c} />)}
    </View>
  </View>;
}

/** Grey cards, breathing, while the first shelves are worked out. */
function Skeleton(): i32 {
  const ref = createNodeRef();
  breathe(ref);
  return <View ref={ref} className="flex-col">
    {[0, 1, 2].map((k: i32) => <View className="flex-col gap-3 pb-6 px-10">
      <View className={`w-[220] h-[18] rounded-[5] ${bg(TRACK)}`} />
      <View className="flex-row gap-5">
        {[0, 1, 2, 3, 4].map((i: i32) => <View className="flex-col gap-2">
          <View className={`rounded-[8] ${bg(TRACK)}`} style={{ width: SHELF_CARD_SIZE, height: SHELF_CARD_SIZE }} />
          <View className={`w-[110] h-[11] rounded-[4] ${bg(TRACK)}`} />
          <View className={`w-[80] h-[10] rounded-[4] ${bg(TRACK)}`} />
        </View>)}
      </View>
    </View>)}
  </View>;
}

function Banner(props: { text: string; button: string }): i32 {
  return <View className={`flex-row items-center gap-4 mx-10 mb-6 px-5 py-4 rounded-[10] border ${bg(CARD)} ${bd(BORDER)}`}>
    <Icon name="clock" size={22} color={() => color(ACCENT)} strokeWidth={2} />
    <Text className={`grow basis-0 min-w-0 text-[13px] ${fg(TEXT)}`}>{props.text}</Text>
    <Button icon="settings" label={props.button} onPress={() => showPage(PAGE_SETTINGS)} />
  </View>;
}

function subtitle(d: ForYouData | null): string {
  if (d === null) return '';
  const data = d as ForYouData;
  const deep = deepNote();
  const from = (data.listens === 0 ? 'From the play counts of this iPod' : `From ${data.listens} listens, ${data.matched} of them songs of this iPod`) + (deep !== '' ? ` · ${deep}` : '');
  return working() ? `${from} · updating…` : from;
}

function Shelves(props: { d: ForYouData }): i32 {
  const d = props.d;
  const rows: Shelf[] = [];
  for (const sh of d.shelves) {
    const cards = sh.id === 'jump' ? jumpCards(d) : sh.cards;
    if (cards.length > 0) rows.push({ id: sh.id, title: sh.title, cards: cards });
    if (sh.id === 'jump' && geniusCards().length > 0) rows.push({ id: 'genius', title: 'Your Genius lists', cards: geniusCards() });
  }
  return <View className="flex-col">
    {d.listens === 0 ? <Banner text="No listening history yet. Import your Last.fm or ListenBrainz history in Settings: the shelves will follow what you really play, not only the iPod's play counts." button="Import in Settings" />
      : d.matched * 2 < d.listens ? <Banner text={`Only ${d.matched} of your ${d.listens} listens are of songs on this iPod: the shelves use those. Settings lists the songs not found.`} button="See in Settings" />
      : <View />}
    {rows.length === 0 ? <Text className={`text-[13px] px-10 ${fg(MUTED)}`}>Nothing to suggest yet: put some music on this iPod.</Text> : <View />}
    {rows.map((sh: Shelf) => <ShelfRow shelf={sh} cards={sh.cards} />)}
  </View>;
}

export function ForYouPage(): i32 {
  // off the first frame: what was kept shows, then the shelves are checked (again when the history or the iPod changes)
  createEffect(() => { historyVersion(); library(); setTimeout(() => { refreshForYou(); }, 0); });
  return <View className="grow flex-col min-h-0">
    <ScrollView className="grow flex-col" scrollKey={scrollKey('foryou')}>
      <View className="flex-row items-end gap-4 px-10 pt-8 pb-5">
        <View className="grow flex-col">
          <Text className={`text-[26px] font-bold ${fg(TEXT)}`}>For you</Text>
          {forYou() === null && working() ? <Working text="Working out your shelves…" />
            : <Text className={`text-[13px] ${fg(MUTED)}`}>{subtitle(forYou())}</Text>}
        </View>
        {forYou() !== null && (forYou() as ForYouData).year.listens > 0
          ? <Button icon="calendar-heart" label={`Your ${(forYou() as ForYouData).year.year}`} onPress={() => showPage(PAGE_YEAR)} /> : <View />}
      </View>
      {forYou() !== null ? <Shelves d={forYou() as ForYouData} /> : <Skeleton />}
      {forYou() !== null ? <MoodMixer /> : null}
    </ScrollView>
  </View>;
}
