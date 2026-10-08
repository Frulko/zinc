// The best score, kept between runs (zinc:storage: a file on desktops, flash on boards; ZINC_STORAGE names another file).
import * as storage from 'zinc:storage';

const KEY = '{{id}}.best';

export function best(): i32 { const v = storage.get(KEY); return v === '' ? 0 : parseInt(v); }

/** Records the score when it beats the best one; true when it did. */
export function record(score: i32): boolean {
  if (score <= best()) return false;
  storage.set(KEY, `${score}`);
  return true;
}
