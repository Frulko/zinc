// The files the tour browses: 10,000 made-up entries spread over a few folders, the same on every run (a fixed generator, no disk access),
// so a session can be replayed and the table always holds the same rows.

export class FileEntry {
  id: i32;
  name: string;
  folder: string;     // a place id of places.ts; 'trash' once moved to the Trash
  kind: string;
  sizeKb: i32;
  modified: string;   // 'YYYY-MM-DD'
  locked: boolean = false;
  tag: string = 'None';
  rating: number = 0; // 0 to 5
  constructor(id: i32, name: string, folder: string, kind: string, sizeKb: i32, modified: string) {
    this.id = id; this.name = name; this.folder = folder; this.kind = kind; this.sizeKb = sizeKb; this.modified = modified;
  }
}

const FOLDERS: string[] = ['documents', 'downloads', 'pictures', 'music', 'zinc', 'site'];
const WORDS: string[] = ['Invoice', 'Holiday', 'Notes', 'Draft', 'Budget', 'Concert', 'Sketch', 'Report', 'Recipe', 'Poster', 'Demo', 'Letter',
  'Garden', 'Mixtape', 'Lecture', 'Station', 'Harbour', 'Prototype', 'Summary', 'Atlas'];
const KINDS: string[] = ['PDF Document', 'JPEG Image', 'Text', 'MP3 Audio', 'TypeScript', 'Folder', 'PNG Image', 'Spreadsheet'];
const EXTENSIONS: string[] = ['.pdf', '.jpg', '.txt', '.mp3', '.ts', '', '.png', '.numbers'];

function twoDigits(n: i32): string { return n < 10 ? `0${n}` : `${n}`; }

/** `count` files; file i always gets the same name, folder, kind, size and date. */
export function makeFiles(count: i32): FileEntry[] {
  const out: FileEntry[] = [];
  let seed: i32 = 12345;
  for (let i: i32 = 0; i < count; i++) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;   // a small LCG: deterministic sizes and dates
    const kind = (seed >> 4) % KINDS.length;
    const name = `${WORDS[i % WORDS.length]} ${i + 1}${EXTENSIONS[kind]}`;
    const date = `2026-${twoDigits(((seed >> 8) % 12) + 1)}-${twoDigits(((seed >> 12) % 28) + 1)}`;
    const size = KINDS[kind] === 'Folder' ? 0 : ((seed >> 3) % 50000) + 1;
    out.push(new FileEntry(i, name, FOLDERS[(seed >> 16) % FOLDERS.length], KINDS[kind], size, date));
  }
  return out;
}

/** A size as Finder writes it: '--' for a folder, then KB, MB. */
export function formatSize(kb: i32): string {
  if (kb === 0) return '--';
  if (kb < 1000) return `${kb} KB`;
  return `${Math.round(kb / 100) / 10} MB`;
}
