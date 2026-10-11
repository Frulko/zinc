// Anonymous statistics of a table (`kiosk.statistics`): what was seen, counted per day. A session goes from the first touch of a visit to
// the reset that forgets it, and adds to the counts of the day it began on: the sessions and their seconds, the hour they began in, the
// language they ended in, each sequence opened and the seconds it was looked at, each picture seen in full, each audio description asked
// for, each point of interest opened, each presentation started and each one played to its end.
// Nothing identifies a visitor: a day's file holds sums. No time is finer than the hour a session began in, and no touch, no position
// and no order of events is kept. The seconds are those up to the last touch (or the end of a presentation being watched): a table left
// alone is not being looked at.
// A day is a CSV file a spreadsheet opens, `what,count,seconds,id`, one line per thing counted (docs/museum-table-format.md, "The
// statistics of a table"). Whoever shows the player owns the files: it gives the function that reads the file of a day and the one that
// writes it (main.ts: the directory named on the command line).

/** What is counted, in the order of the file. */
const WHAT: string[] = ['session', 'hour', 'language', 'sequence', 'medium', 'description', 'point', 'presentation', 'presentation-ended'];
const HEAD = 'what,count,seconds,id';

/** Counts and seconds, by what is counted and its id. */
export class Counts {
  private rows = new Map<string, number[]>();   // "what,id": [count, seconds]

  add(what: string, id: string, count: number, seconds: number): void {
    const key = `${what},${id}`, row = this.rows.get(key);
    if (row === undefined) this.rows.set(key, [count, seconds]);
    else { row[0] += count; row[1] += seconds; }
  }
  count(what: string, id: string): number { return (this.rows.get(`${what},${id}`) ?? [0, 0])[0]; }
  seconds(what: string, id: string): number { return (this.rows.get(`${what},${id}`) ?? [0, 0])[1]; }
  /** The ids counted under `what`, sorted. */
  ids(what: string): string[] {
    const found: string[] = [];
    for (const key of this.rows.keys()) if (key.startsWith(`${what},`)) found.push(key.slice(what.length + 1));
    return found.sort((a: string, b: string) => a < b ? -1 : a > b ? 1 : 0);
  }
  merge(other: Counts): void {
    for (const what of WHAT) for (const id of other.ids(what)) this.add(what, id, other.count(what, id), other.seconds(what, id));
  }

  /** The file of a day: whole seconds, and no seconds for what has none. An id comes last, so it may hold a comma. */
  csv(): string {
    const lines: string[] = [HEAD];
    for (const what of WHAT) for (const id of this.ids(what)) {
      const timed = what === 'session' || what === 'sequence';
      lines.push(`${what},${Math.round(this.count(what, id))},${timed ? `${Math.round(this.seconds(what, id))}` : ''},${id.replaceAll('\n', ' ')}`);
    }
    return lines.join('\n') + '\n';
  }
  /** The counts of a file ('' for none); a line that is not one of its lines is skipped. */
  static parse(csv: string): Counts {
    const c = new Counts();
    for (const line of csv.split('\n')) {
      const a = line.indexOf(','), b = line.indexOf(',', a + 1), d = line.indexOf(',', b + 1);
      if (a < 0 || b < 0 || d < 0 || WHAT.indexOf(line.slice(0, a)) < 0) continue;
      const count = parseInt(line.slice(a + 1, b), 10), seconds = d > b + 1 ? parseInt(line.slice(b + 1, d), 10) : 0;
      if (count - count === 0 && seconds - seconds === 0) c.add(line.slice(0, a), line.slice(d + 1), count, seconds);
    }
    return c;
  }
}

function two(n: number): string { return n < 10 ? `0${n}` : `${n}`; }
/** The day of a moment, in the time of the table: 2026-10-11. */
function dayOf(d: Date): string { return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`; }

export class Statistics {
  private read: (day: string) => string;
  private write: (day: string, csv: string) => void;
  /** The session under way (null between two visits), the day it began on, and what has passed since the last touch. */
  private session: Counts | null = null;
  private date = '';
  private since = new Counts();

  /** `read`: the file of a day ('' when there is none). `write`: replaces it. */
  constructor(read: (day: string) => string, write: (day: string, csv: string) => void) { this.read = read; this.write = write; }

  /** A visit begins, on this sequence. */
  begin(sequence: string): void {
    const now = new Date(), s = new Counts();
    s.add('session', '', 1, 0);
    s.add('hour', two(now.getHours()), 1, 0);
    this.session = s; this.date = dayOf(now); this.since = new Counts();
    this.note('sequence', sequence);
  }
  /** Something of the visit to count once: a sequence opened, a medium seen in full, a description, a point, a presentation. */
  note(what: string, id: string): void { this.session?.add(what, id, 1, 0); }
  /** `dt` seconds pass on a sequence: they count once a touch follows them. */
  pass(dt: number, sequence: string): void {
    if (this.session === null) return;
    this.since.add('session', '', 0, dt);
    this.since.add('sequence', sequence, 0, dt);
  }
  /** A hand is on the table, or a presentation is being watched: the time since the last touch was spent looking. */
  touched(): void {
    const s = this.session;
    if (s === null) return;
    s.merge(this.since);
    this.since = new Counts();
  }
  /** The visit is forgotten: it is added to its day, with the language it ended in. */
  end(lang: string): void {
    const s = this.session;
    if (s === null) return;
    s.add('language', lang, 1, 0);
    const all = Counts.parse(this.read(this.date));
    all.merge(Counts.parse(s.csv()));   // through its file: whole seconds
    this.write(this.date, all.csv());
    this.session = null;
  }
  /** The touches since `begin` were not a visit (the staff's gesture): nothing of them is kept. */
  drop(): void { this.session = null; }
  /** Today, as its file is named, and its counts, as its file has them. */
  get day(): string { return dayOf(new Date()); }
  today(): Counts { return Counts.parse(this.read(this.day)); }
}
