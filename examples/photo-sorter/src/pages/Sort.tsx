// The sorting screen: the pile of pictures, one tile per album and the trash; each filing is done on disk at once and undone on undo.
import { Icon } from 'zinc:icons';
import { pct } from 'zinc:ui';
import { createDeck, Deck, THEME, kvStore, colorOf } from 'zinc:trieur';
import { createRecommender } from '@trieur/learn';
import { flick } from '@trieur/core/flick';
import type { PlacedZone } from '@trieur/core';
import { t } from '../i18n';
import { settings, setScreen, trashed, setTrashed, filed, setFiled } from '../state';
import { file, throwAway, revert, meta, join, type Op, type Photo, type Album } from '../library';
import { PhotoCard, CARD_W, CARD_H } from '../components/PhotoCard';
import { Pill } from '../components/ui';

const TRASH = { id: '__trash', label: '', icon: 'trash', color: '#ef4444' };

export function Sort(p: { photos: Photo[] }): any {
  const s = settings();
  const ops = new Map<Photo, Op[]>();
  const count = (z: PlacedZone[], d: number) => {
    const f = { ...filed() };
    for (const zone of z) {
      if (zone.id === TRASH.id) continue;
      const a = s.albums.find((x) => x.id === zone.id)!;
      const was = f[zone.id] ?? { n: 0, dir: join(s.output === '' ? s.sources[0]! : s.output, a.label) };
      f[zone.id] = { ...was, n: was.n + d };
    }
    setFiled(f);
  };
  const doFile = (photo: Photo, zones: PlacedZone[]) => {
    if (zones.some((z) => z.id === TRASH.id)) {
      const done = throwAway(photo);
      ops.set(photo, done);
      setTrashed([...trashed(), ...done]);
      return;
    }
    const albums = zones.map((z) => s.albums.find((a) => a.id === z.id)!).filter(Boolean) as Album[];
    ops.set(photo, file(photo, albums, s));
    count(zones, 1);
  };
  const undo = (photo: Photo, zones: PlacedZone[]) => {
    const done = ops.get(photo) ?? [];
    revert(done);
    ops.delete(photo);
    if (zones.some((z) => z.id === TRASH.id)) setTrashed(trashed().filter((o) => !done.includes(o)));
    else count(zones, -1);
  };
  const deck = createDeck<Photo>({
    items: p.photos,
    zones: [...s.albums, { ...TRASH, label: t.trash }],
    meta,
    multi: true,
    layout: 'auto',
    cardW: CARD_W,
    cardH: CARD_H,
    tile: 108,
    advisor: createRecommender({ key: 'photo-sorter', store: kvStore('photo-sorter:') }),
    plugins: [flick()],
    onSort: (photo, z) => doFile(photo, [z]),
    onSortMany: (photo, zs) => doFile(photo, zs),
    onUndo: (photo, z) => undo(photo, [z]),
    onUndoMany: (photo, zs) => undo(photo, zs),
    onEmpty: () => setTimeout(() => setScreen('done'), 700),
  });
  const total = p.photos.length;
  return <View className="grow flex-col">
    <View className="h-[60] shrink-0 flex-row items-center gap-4 px-5">
      <Pill label={() => t.back} icon="chevron-left" onClick={() => setScreen('setup')} />
      <View className="grow h-[8] rounded-full overflow-hidden" style={{ backgroundColor: THEME.chip }}>
        <View className="h-full rounded-full" style={{ width: pct(100 * (total - deck.items().length) / Math.max(total, 1)), backgroundColor: THEME.accent }} />
      </View>
      <Text className="text-[13px] font-semibold" style={{ color: THEME.dim }}>{t.sorted(total - deck.items().length)}</Text>
      <View className="flex-row items-center gap-1 h-[32] px-3 rounded-full" style={{ backgroundColor: trashed().length ? 0xef4444 : THEME.chip }}>
        <Icon name="trash" size={14} color={() => (trashed().length ? 0xffffff : THEME.dim)} />
        <Text className="text-[12px] font-semibold" style={{ color: trashed().length ? 0xffffff : THEME.dim }}>{String(trashed().length)}</Text>
      </View>
      <Pill primary label={() => t.finish} icon="check" onClick={() => setScreen('done')} />
    </View>
    <Deck deck={deck} renderCard={(ph: Photo) => <PhotoCard photo={ph} />} renderZone={(z, st) => <View className="items-center gap-[6]">
      <View className="w-[54] h-[54] rounded-[16] items-center justify-center" style={{ backgroundColor: colorOf(z), shadowColor: colorOf(z), shadowOpacity: 0.55, shadowRadius: 14, shadowOffsetY: 4 }}>
        <Icon name={z.icon!} size={26} color={() => 0xffffff} />
      </View>
      <Text className="text-[12px] font-semibold text-center" numberOfLines={1} style={{ color: THEME.ink, maxWidth: 100 }}>{z.id === TRASH.id ? t.trash : z.label!}</Text>
      <View className="flex-row items-center gap-1">
        <View className="px-[6] h-[18] rounded-[5] items-center justify-center" style={{ backgroundColor: THEME.keycap }}><Text className="text-[10px] font-mono" style={{ color: THEME.dim }}>{(z.key ?? '').toUpperCase()}</Text></View>
        <Text className="text-[11px] font-semibold" style={{ color: st().near ? THEME.ink : THEME.dim }}>{z.id === TRASH.id ? String(trashed().length) : String(filed()[z.id]?.n ?? 0)}</Text>
      </View>
    </View>} />
  </View>;
}
