// The rules of a table as a person says them: "When the ball hits pops: add 500 points", "the lights of lanes are all on".
// The format says what each kind of condition and of action reads (the variants of its schema); strings.ts has a sentence per kind
// in each language, with the place of every part. Here the two meet: the pieces of a sentence (words, and the parts that a form
// turns into choices), and the same sentence as plain text for the lists and the titles. No screen: selftest.ts prints them.
import { Schema, Kind, Variant } from '../../pinball3d/src/format/schema';
import { phrase, readable, amount, t, f, RULE_SAID, RULE_IF, AND, THEN } from './strings';

/** A piece of a sentence: words, or the place of a part (`slot`: "target", "way", or the name of a number field). */
export class Piece {
  text: string; slot: string;
  constructor(text: string, slot: string) { this.text = text; this.slot = slot; }
}
/** The pieces of a sentence written with its parts in braces. */
export function pieces(template: string): Piece[] {
  const out: Piece[] = [];
  let rest = template;
  while (rest.length > 0) {
    const open = rest.indexOf('{'), close = rest.indexOf('}');
    if (open < 0 || close < open) { out.push(new Piece(rest, '')); break; }
    if (open > 0) out.push(new Piece(rest.slice(0, open), ''));
    out.push(new Piece('', rest.slice(open + 1, close)));
    rest = rest.slice(close + 1);
  }
  return out;
}
/** The sentence of one kind of object (`object`: the name the format gives it, "condition", "action" or "step"), with its way, as
 *  a form lays it out: every part has its place. */
export function sentenceOf(object: string, v: Variant, way: string): string { return written(object, v, way).replaceAll('[', '').replaceAll(']', ''); }
/** The same as strings.ts writes it: a part in square brackets is said only when its number is not 1 ("Hit pops[ {count} times]"). */
function written(object: string, v: Variant, way: string): string {
  const own = way === '' ? '' : phrase(`say.${object}.${v.word}.${way}`), usual = own !== '' ? own : phrase(`say.${object}.${v.word}`);
  if (usual !== '') return usual;
  // a kind the editor has no sentence for yet (the format grew): its word, then what it reads
  let out = readable(v.word);
  if (v.aimed) out += ' {target}';
  if (v.ways.length > 0) out += ' {way}';
  for (const n of v.numbers) { const name = n.indexOf(':') < 0 ? n : n.slice(0, n.indexOf(':')); if (v.uses(name, way)) out += ` {${name}}`; }
  return out;
}
/** A word of a way or of a target as the sentence of its kind says it ("on" is "turn on" for an action on lights). */
export function wordSaid(object: string, kind: string, word: string): string {
  const own = phrase(`word.${object}.${kind}.${word}`), usual = own !== '' ? own : phrase(`word.${word}`);
  return usual !== '' ? usual : word === '' ? '-' : word;
}
/** A kind as the menu that adds one offers it: its own words, else the start of its sentence ("Hit …"), else its word. */
export function kindSaid(object: string, kind: string): string {
  const s = phrase(`kind.${object}.${kind}`), whole = phrase(`say.${object}.${kind}`);
  if (s !== '' || whole === '') return s === '' ? readable(kind) : s;
  const part = whole.indexOf('{'), cut = whole.indexOf('[');
  return part >= 0 && (cut < 0 || part < cut) ? `${whole.slice(0, part).trim()} …` : cut >= 0 ? whole.slice(0, cut).trim() : whole;
}
/** The fields of an object with kinds that no kind names: they are read whatever the kind (the text and the light of a step). */
export function extrasOf(s: Schema): string[] {
  const vs = s.variants, out: string[] = [];
  if (vs === null) return out;
  for (const fd of s.fields) {
    let named = fd.name === vs.kind || fd.name === vs.target || fd.name === vs.way;
    for (const v of vs.all) for (const n of v.numbers) if (n === fd.name || n.startsWith(`${fd.name}:`)) named = true;
    if (!named) out.push(fd.name);
  }
  return out;
}
/** The field of an object with kinds that holds what the game shows a player for it: the editor writes it from the object's
 *  sentence until someone types another; '' for none.
 *  ponytail: known by the name of the kind of object, the format has no word for such a field. It is written in the language the
 *  interface has then, and is the editor's only while it reads as the sentence does in the language the interface has now. */
export function shownField(s: Schema): string { return s.variants !== null && s.name === 'step' ? 'text' : ''; }
/** Writes that text from the sentence of the object. */
export function word(s: Schema, item: any): void { const name = shownField(s); if (name !== '') item[name] = said(s, item); }
/** Whether that text is the editor's: what the sentence of the object says. */
export function worded(s: Schema, item: any): boolean { const name = shownField(s); return name !== '' && item[name] === said(s, item); }

/** A condition or an action (an object of a schema with kinds) as a sentence. */
export function said(s: Schema, item: any): string {
  const vs = s.variants;
  if (vs === null) return '';
  const kind: string = item[vs.kind], v = vs.of(kind);
  if (v === null) return kind;
  const way: string = vs.way === '' ? '' : item[vs.way], target: string = item[vs.target];
  // a part in square brackets is left out when its number is 1
  let text = written(s.name, v, way), out = '';
  const open = text.indexOf('['), close = text.indexOf(']');
  if (open >= 0 && close > open) {
    const inner = pieces(text.slice(open + 1, close)).filter((p: Piece) => p.slot !== '');
    text = text.slice(0, open) + (inner.length > 0 && (item[inner[0].slot] === 1 || item[inner[0].slot] === undefined) ? '' : text.slice(open + 1, close)) + text.slice(close + 1);
  }
  for (const p of pieces(text)) {
    if (p.slot === '') out += p.text;
    else if (p.slot === 'way') out += wordSaid(s.name, kind, way);
    else if (p.slot === 'target') out += v.text ? `"${target}"` : v.words.indexOf(target) >= 0 ? wordSaid(s.name, kind, target) : target;
    else { const n: any = item[p.slot]; out += typeof n === 'number' ? amount(n) : ''; }
  }
  return out;
}
/** What happens, and where: "When the ball hits pops". */
export function whenSaid(on: string, event: string): string {
  const own = phrase(`when.${event}`);
  return own === '' ? `${on} ${event}` : own.replaceAll('{on}', on);
}
/** A whole rule (an object with where the event comes from, the event, and lists of objects with kinds) as one sentence:
 *  "When the ball rolls over lanes, if the lights of lanes are all on: raise the bonus multiplier by 1; turn off the lights of lanes".
 *  An object that listens to nothing itself (a mission) is said by its name and its list: "Cargo Run: Ride rail to its end 2 times". */
export function ruleSaid(s: Schema, rule: any): string {
  let when = typeof rule.event === 'string' ? whenSaid(`${rule.on}`, `${rule.event}`) : `${rule.name}`;
  const ifs: string[] = [], does: string[] = [];
  for (const fd of s.fields) {
    if (fd.kind !== Kind.List || fd.of === null || (fd.of as Schema).variants === null) continue;
    const items: any = rule[fd.name], of = fd.of as Schema;
    // the first list of kinds is what must hold, the next what is done: the order of the format
    for (let i = 0; i < items.length; i++) { if (fd.name === 'if') ifs.push(said(of, items[i])); else does.push(said(of, items[i])); }
  }
  if (ifs.length > 0) when = f(RULE_IF, when, ifs.join(t(AND)));
  return f(RULE_SAID, when, does.join(t(THEN)));
}
