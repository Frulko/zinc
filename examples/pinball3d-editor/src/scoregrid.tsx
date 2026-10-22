// The scores of the table as a grid (scores.ts), in the place of the top view while the rules themselves are selected: a row per
// group and per element that sends events, a column per event, a number where the thing sends the event. A number typed there is
// the points of a rule without a condition (state.ts setScore). The box at the top keeps the rows whose name holds what is typed
// (Cmd+K): a row is reached by its name, not by its place. The names do not answer a click.
import { createSignal, createNodeRef, For, Show } from 'zinc:ui/solid';
import * as ui from 'zinc:ui';
import { doc, selected, setScore, refresh } from './state';
import { scoreRows, scoreEvents, scoreOf } from './scores';
import { typed, isNumber } from './form';
import { Ico, Heading, MUTED, chord } from './widgets';
import * as L from './strings';
import { t, f, listName, phrase } from './strings';

/** Whether the rules themselves are selected: the scores are then shown instead of the top view. */
export function scoresShown(): boolean { return selected() === 'rules'; }

const [wanted, setWanted] = createSignal<string>('');
const finder = createNodeRef();
/** Puts the caret in the box that finds a row (Cmd+K). */
export function findScore(): void { if (scoresShown() && finder.node >= 0) { ui.focusNode(finder.node); ui.select(finder.node, 0, ui.getValue(finder.node).length); } }

// ponytail: the columns have a fixed width that fits the ten events elements send today in a window of 1440; a horizontal scroll if the format gains more
const NAME = 116, KIND = 76, COL = 50;
const EVENTS = scoreEvents();

/** One row, from its line "name|g or e|list|events it sends": made again only when one of these changes, so that a cell keeps the
 *  caret while its number is typed. */
function Row(p: { line: string }): i32 {
  const parts = p.line.split('|'), name = parts[0], sends = parts[3].split(' ');
  return <View className="flex-row items-center h-7 px-3 shrink-0 border-b border-zinc-900">
    <Text className="shrink-0 truncate text-xs text-zinc-100" style={{ width: NAME }}>{name}</Text>
    <Text className="shrink-0 truncate text-[11px] text-zinc-500" style={{ width: KIND }}>{listName(parts[2], parts[1] === 'e')}</Text>
    {EVENTS.map((e: string, k: i32) => <Cell name={name} event={e} sent={sends.indexOf(e) >= 0} />)}
  </View>;
}
/** The points of a thing at an event; an empty place when the thing does not send the event. */
function Cell(p: { name: string; event: string; sent: boolean }): i32 {
  if (!p.sent) return <View className="shrink-0" style={{ width: COL }} />;
  const points = (): number => scoreOf(doc().data, p.name, p.event);
  return <View className="shrink-0" style={{ width: COL }}>
    <Input className="py-1.5 h-6 px-1 rounded bg-zinc-950 border border-zinc-800 text-xs text-zinc-100 focus:border-amber-400" style={{ width: COL - 6 }} value={points() === 0 ? '' : `${points()}`}
      onChange={(v: string) => { const n = v.trim() === '' ? 0 : typed(v); if (isNumber(n)) setScore(p.name, p.event, n); else refresh(); }} />
  </View>;
}
export function ScoreGrid(): i32 {
  const lines = (): string[] => {
    const want = wanted().trim().toLowerCase(), out: string[] = [];
    // the row called exactly so comes first, whatever the others that hold the text
    for (let exact = 1; exact >= 0; exact--) for (const r of scoreRows(doc().data)) {
      const n = r.name.toLowerCase();
      if ((n === want) === (exact === 1) && (want === '' || n.indexOf(want) >= 0)) out.push(`${r.name}|${r.group ? 'g' : 'e'}|${r.list}|${r.sends.join(' ')}`);
    }
    return out;
  };
  return <View className="grow basis-0 min-w-0 flex-col bg-zinc-950">
    <View className="flex-row items-center gap-3 h-9 px-3 shrink-0 bg-zinc-900 border-b border-zinc-800">
      <Heading label={t(L.SCORES)} />
      <Text className="grow basis-0 truncate text-[11px] text-zinc-500">{t(L.SCORES_HOW)}</Text>
    </View>
    <View className="flex-row items-center h-9 px-3 shrink-0 border-b border-zinc-800">
      <View className="flex-row items-center gap-2 shrink-0" style={{ width: NAME + KIND }}>
        <Ico name="search" size={13} color={MUTED} />
        <Input ref={finder} style={{ width: NAME + KIND - 34 }} className="py-1.5 h-7 px-2 rounded-md bg-zinc-950 border border-zinc-800 text-xs text-zinc-100 focus:border-amber-400" placeholder={f(L.FIND_SCORE, chord('K'))}
          value={wanted()} onInput={(v: string) => setWanted(v)} onKeyDown={(e: ui.KeyEvent) => { if (e.key === 'Escape') setWanted(''); }} />
      </View>
      {EVENTS.map((e: string, k: i32) => <Text className="shrink-0 truncate text-[10px] font-bold text-zinc-400" style={{ width: COL }}>{(phrase(`event.${e}`) === '' ? e : phrase(`event.${e}`)).toUpperCase()}</Text>)}
    </View>
    <ScrollView className="grow basis-0 min-h-0 flex-col">
      <For each={lines()}>{(line: string, i: i32) => <Row line={line} />}</For>
      <Show when={lines().length === 0}><Text className="px-3 py-3 text-xs text-zinc-500">{t(L.NO_SCORES)}</Text></Show>
    </ScrollView>
  </View>;
}
