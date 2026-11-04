// A clip: what a cell of the grid plays, a media file or a source of the mapper, and how. An empty one stands for an empty cell.
export interface Clip { label: string; media: string; source: string; color: number[]; fit: string; frame: number[]; loop: boolean }   // frame: /layer/n/frame

export interface Column { name: string; cells: Clip[] }

export const EMPTY_CLIP: Clip = { label: '', media: '', source: '', color: [], fit: 'cover', frame: [0, 0, 1], loop: true };
const MIN_COLUMNS: i32 = 8;

export function isEmptyClip(clip: Clip): boolean { return clip.media === '' && clip.source === ''; }

/** A clip from a saved show: one saved before sources has a media and a fit only. */
export function clipFrom(saved: any): Clip {
  if (saved === null || saved === undefined) return { ...EMPTY_CLIP };
  const media = typeof saved.media === 'string' ? saved.media as string : '';
  const source = typeof saved.source === 'string' ? saved.source as string : '';
  return {
    label: typeof saved.label === 'string' ? saved.label as string : media,
    media,
    source,
    color: Array.isArray(saved.color) ? saved.color as number[] : [],
    fit: typeof saved.fit === 'string' ? saved.fit as string : 'cover',
    frame: Array.isArray(saved.frame) ? saved.frame as number[] : [0, 0, 1],
    loop: typeof saved.loop === 'boolean' ? saved.loop as boolean : true,
  };
}

export function columnIsEmpty(cells: Clip[]): boolean {
  for (const cell of cells) {
    if (!isEmptyClip(cell)) return false;
  }
  return true;
}

/** The grid is never full: at least MIN_COLUMNS, and a free column at the end. */
export function ensureColumns(columns: Column[]): Column[] {
  while (columns.length < MIN_COLUMNS || !columnIsEmpty(columns[columns.length - 1].cells)) {
    columns.push({ name: `Column ${columns.length + 1}`, cells: [] as Clip[] });
  }
  return columns;
}

/** The first column whose cell of this layer is free; there always is one once `ensureColumns` ran. */
export function firstFreeColumn(columns: Column[], layer: i32): i32 {
  for (let column: i32 = 0; column < columns.length; column++) {
    const cells = columns[column].cells;
    if (layer >= cells.length || isEmptyClip(cells[layer])) return column;
  }
  return columns.length as i32;
}
