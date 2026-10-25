// The scores of a table as a grid: a row per group and per element that sends events to the rules, a column per event, and in a
// cell the points the thing scores at that event. The grid holds nothing of its own: a cell reads, and writes, the first rule that
// listens to that event there without a condition and scores (one rule per cell that has a score). A rule with a condition, and
// what a rule does beside scoring, are seen in the rule's own form. Pure code: the view is scoregrid.tsx, selftest.ts runs this
// without a window.
import { SENDS, EVENTS } from '../../pinball-kit/format/table-schema';

export class ScoreRow {
  /** What a rule names: a group of elements, or one element. */
  name: string;
  group: boolean;
  /** The list of the table it is shown under. */
  list: string;
  /** The events it can send: the columns in which it has a cell. */
  sends: string[];
  constructor(name: string, group: boolean, list: string, sends: string[]) { this.name = name; this.group = group; this.list = list; this.sends = sends; }
}
/** The columns: the events elements send, in the order the format lists its events. */
export function scoreEvents(): string[] {
  const sent: string[] = [];
  for (const row of SENDS) for (let k = 1; k < row.length; k++) sent.push(row[k]);
  return EVENTS.filter((e: string) => sent.indexOf(e) >= 0);
}
/** The rows of a table (`data`: its tree): for each list whose elements send events, its groups, then its elements. A group
 *  that has things of several lists is shown once, under the first, with the events of all of them. */
export function scoreRows(data: any): ScoreRow[] {
  const out: ScoreRow[] = [], seen: string[] = [];
  for (const row of SENDS) {
    const items: any = data[row[0]];
    if (!Array.isArray(items)) continue;
    for (let pass = 0; pass < 2; pass++) for (let i = 0; i < items.length; i++) {
      const n: any = pass === 0 ? items[i].group : items[i].id;
      if (typeof n !== 'string' || n === '') continue;
      const name = `${n}`, at = seen.indexOf(name);
      if (at < 0) { seen.push(name); out.push(new ScoreRow(name, pass === 0, row[0], row.slice(1))); }
      else if (pass === 0) for (let k = 1; k < row.length; k++) if (out[at].sends.indexOf(row[k]) < 0) out[at].sends.push(row[k]);
    }
  }
  return out;
}
/** The place, in the rules, of the rule a cell reads: the first that listens to `event` from `on` without a condition and, with
 *  `scoring`, that scores; -1 for none. */
function ruleAt(when: any, on: string, event: string, scoring: boolean): i32 {
  for (let i = 0; i < when.length; i++) {
    const w: any = when[i], does: any = w.do;
    if (w.on !== on || w.event !== event || w.if.length > 0) continue;
    if (!scoring) return i;
    for (let k = 0; k < does.length; k++) if (does[k].do === 'score') return i;
  }
  return -1;
}
/** The points of a cell: what `on` scores at `event` whatever else holds; 0 for an empty cell. */
export function scoreOf(data: any, on: string, event: string): number {
  const when: any = data.rules.when, at = ruleAt(when, on, event, true);
  if (at < 0) return 0;
  const does: any = when[at].do;
  for (let k = 0; k < does.length; k++) if (does[k].do === 'score') { const v: number = does[k].value; return v; }
  return 0;
}
/** What giving a cell `points` changes in a table's tree (0 empties the cell): the points of the rule the cell reads; or a
 *  scoring action more in a rule that listens there without a condition; or a new rule, at the end. An emptied cell loses its
 *  scoring action, and its rule when the rule did nothing else. */
export function scoreChange(on: string, event: string, points: number): (d: any) => void {
  return (d: any): void => {
    const when: any = d.rules.when, at = ruleAt(when, on, event, true), plain = ruleAt(when, on, event, false);
    const all: any[] = [];
    for (let i = 0; i < when.length; i++) if (!(i === at && points === 0 && when[i].do.length === 1)) all.push(when[i]);
    if (at >= 0) {
      const does: any = when[at].do, kept: any[] = [];
      let found = false;
      for (let k = 0; k < does.length; k++) {
        const scores = !found && does[k].do === 'score';
        if (scores) { found = true; does[k].value = points; }
        if (!scores || points !== 0) kept.push(does[k]);
      }
      when[at].do = kept;
    } else if (points !== 0) {
      const score: any = { do: 'score', value: points };
      if (plain >= 0) {
        const does: any = when[plain].do, more: any[] = [score];
        for (let k = 0; k < does.length; k++) more.push(does[k]);
        when[plain].do = more;
      } else {
        const rule: any = { on: on, event: event, do: [score] };
        all.push(rule);
      }
    }
    d.rules.when = all;
  };
}
