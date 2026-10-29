// trieur's flashcards: the four answers of SM-2 docked under the card, each tile saying when the card comes back; "Again" puts it
// back on the pile three cards down.
import { Icon } from 'zinc:icons';
import { createSignal, Show } from 'zinc:ui/solid';
import { createDeck, Deck, THEME, colorOf, type TileState } from 'zinc:trieur';
import type { PlacedZone } from '@trieur/core';
import { t } from '../../i18n';
import { cards, grades, schedule, preview, type Flashcard } from '@trieur/data/cards';

const ICONS: Record<string, string> = { again: 'rotate-ccw', hard: 'triangle', good: 'circle-check', easy: 'sparkles' };

export function StudyPage(): any {
  const [shown, setShown] = createSignal(false);
  const [done, setDone] = createSignal(0);
  const deck = createDeck<Flashcard>({
    items: cards,
    zones: grades.map((g) => ({ ...g, icon: ICONS[g.id] })),
    keys: 'asdf',
    layout: 'dock',
    cardW: 380,
    cardH: 240,
    onSort: (card, zone) => {
      setShown(false);
      const next = schedule(card, grades.find((g) => g.id === zone.id)!.q);
      if (next.due > 0) { setDone(done() + 1); return; }
      // a lapse: the card comes back a little later in the session
      setTimeout(() => { const rest = deck.items(); deck.setItems([...rest.slice(0, 3), next, ...rest.slice(3)]); });
    },
  });
  const days = (z: PlacedZone): string => { const c = deck.items()[0]; return c ? preview(c).find((p) => p.id === z.id)?.label ?? '' : ''; };
  const tile = (z: PlacedZone, st: () => TileState) => <View className="items-center gap-[6]">
    <View className="w-[50] h-[50] rounded-[15] items-center justify-center" style={{ backgroundColor: colorOf(z), shadowColor: colorOf(z), shadowOpacity: 0.5, shadowRadius: 12, shadowOffsetY: 4 }}>
      <Icon name={z.icon!} size={24} color={() => 0xffffff} />
    </View>
    <Text className="text-[12px] font-semibold" style={{ color: THEME.ink }}>{t.grades[z.id] ?? z.label!}</Text>
    <Text className="text-[11px]" style={{ color: st().near ? THEME.ink : THEME.dim }}>{t.days(days(z))}</Text>
  </View>;
  return <View className="grow flex-col">
    <View className="h-[44] shrink-0 flex-row items-center gap-3 px-5">
      <Icon name="graduation-cap" size={18} color={() => THEME.accent} />
      <Text className="text-[13px]" style={{ color: THEME.dim }}>{t.learnt(done())}</Text>
    </View>
    <Deck deck={deck} renderZone={tile} renderCard={(c: Flashcard) => <View className="grow p-6 gap-3" onClick={() => setShown(!shown())}>
      <View className="flex-row items-center gap-2">
        <View className="px-2 h-[22] rounded-full items-center justify-center" style={{ backgroundColor: THEME.tag }}><Text className="text-[11px]" style={{ color: THEME.tagInk }}>{c.deck}</Text></View>
      </View>
      <Text className="text-[22px] font-semibold leading-[28px]" style={{ color: THEME.ink }}>{c.front}</Text>
      <View className="grow" />
      <Show when={shown() && deck.items()[0] === c} fallback={<Text className="text-[13px]" style={{ color: THEME.dim }}>{t.showAnswer}</Text>}>
        <View className="gap-1">
          <Text className="text-[24px] font-bold" style={{ color: THEME.accent }}>{c.back}</Text>
          {c.note ? <Text className="text-[12px]" style={{ color: THEME.body }}>{c.note}</Text> : null}
        </View>
      </Show>
    </View>} />
  </View>;
}
