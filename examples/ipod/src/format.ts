// How numbers are shown: durations, sizes, counts.

function pad2(n: number): string { return n < 10 ? `0${n}` : `${n}`; }

/** 215000 → "3:35", 4000000 → "1:06:40". */
export function duration(ms: number): string {
  const s = Math.floor(ms / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return h > 0 ? `${h}:${pad2(m)}:${pad2(sec)}` : `${m}:${pad2(sec)}`;
}

/** A total playing time: "42 min", "5 h 12 min", "3 days 4 h". */
export function longDuration(ms: number): string {
  const min = Math.floor(ms / 60000), h = Math.floor(min / 60), d = Math.floor(h / 24);
  if (d > 0) return `${d} ${d === 1 ? 'day' : 'days'} ${h % 24} h`;
  if (h > 0) return `${h} h ${min % 60} min`;
  return min > 0 ? `${min} min` : `${Math.floor(ms / 1000)} s`;
}

/** Bytes as the Finder shows them (powers of 1000): "1.2 GB", "340 MB", "12 KB". */
export function bytes(b: number): string {
  if (b >= 1e9) return `${Math.round(b / 1e8) / 10} GB`;
  if (b >= 1e6) return `${Math.round(b / 1e6)} MB`;
  return `${Math.round(b / 1e3)} KB`;
}

/** "1 song", "12 songs". */
export function count(n: number, one: string, many: string): string { return `${n} ${n === 1 ? one : many}`; }
