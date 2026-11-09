// Shared by the Nuxt and Quiet navigation families. Page numbers are one based; zero marks an ellipsis.
/** The page numbers Nuxt UI (Reka) shows: the first, the last, `siblings` around the current one, 0 for an ellipsis. */
export function pageItems(page: i32, pages: i32, siblings: i32): i32[] {
  const out: i32[] = [];
  if (pages <= siblings * 2 + 5) { for (let i = 1; i <= pages; i++) out.push(i); return out; }
  const lo = Math.max(2, page - siblings), hi = Math.min(pages - 1, page + siblings);
  out.push(1);
  if (lo > 2) out.push(0);
  for (let i = lo; i <= hi; i++) out.push(i);
  if (hi < pages - 1) out.push(0);
  out.push(pages);
  return out;
}
