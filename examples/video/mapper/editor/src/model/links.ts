// Linked corners: the same physical point on two surfaces. They move together on the output and the 3D view joins the surfaces there.
import { Link } from './room';

export interface CornerRef { layer: string; corner: i32 }

function same(a: CornerRef, b: CornerRef): boolean { return a.layer === b.layer && a.corner === b.corner; }

/** Every corner linked to this one, through any number of links; not the corner itself. */
export function linkedCorners(links: Link[], start: CornerRef): CornerRef[] {
  const found: CornerRef[] = [start];
  for (let at: i32 = 0; at < found.length; at++) {
    for (const link of links) {
      const a: CornerRef = { layer: link.a, corner: link.cornerA }, b: CornerRef = { layer: link.b, corner: link.cornerB };
      const next = same(found[at], a) ? b : same(found[at], b) ? a : null;
      if (next !== null && found.findIndex((known: CornerRef) => same(known, next as CornerRef)) < 0) found.push(next as CornerRef);
    }
  }
  return found.slice(1);
}

export function addLink(links: Link[], a: CornerRef, b: CornerRef): void {
  if (a.layer === b.layer || linkedCorners(links, a).findIndex((known: CornerRef) => same(known, b)) >= 0) return;
  links.push({ a: a.layer, cornerA: a.corner, b: b.layer, cornerB: b.corner });
}

export function removeLinksOf(links: Link[], corner: CornerRef): void {
  for (let i: i32 = links.length - 1; i >= 0; i--) {
    const link = links[i];
    if (same(corner, { layer: link.a, corner: link.cornerA }) || same(corner, { layer: link.b, corner: link.cornerB })) links.splice(i, 1);
  }
}
