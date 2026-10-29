// Built-in layouts. A layout places N zones around the centre, in pixels.
//
// A layout may also hand back the **regions** themselves. Positions alone give tiles floating
// over a Voronoi carving; a radial menu wants annulus sectors and a grid wants rectangles,
// neither of which a set of points can describe.

import type { Layout, LayoutBox, Placement, Point, Polygon } from './types.js';
import { voronoi } from './voronoi.js';

const TAU = Math.PI * 2;

/**
 * Tags a layout with the name it should answer to.
 *
 * The deck puts `tr-layout-<name>` on the root, and the stylesheet leans on it — a radial menu
 * draws its tiles as bare labels inside their wedges, a dock stands them on the edge. A layout
 * built by a factory is a plain function, so without this `radialLayout({ sweep })` arrived as
 * `custom` and lost every rule written for the shape it actually is.
 */
const name = (fn: Layout, layoutName: string): Layout => Object.assign(fn, { layoutName });

/** Radius of an ellipse (rx, ry) at angle `a`. */
const onEllipse = (rx: number, ry: number, a: number): number => {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return (rx * ry) / Math.sqrt((ry * c) ** 2 + (rx * s) ** 2 || 1);
};

/** Splits `n` across buckets in proportion to `weights`, whole numbers, at least one each. */
function share(n: number, weights: number[]): number[] {
  const total = weights.reduce((a, b) => a + b, 0) || 1;
  const raw = weights.map((c) => (n * c) / total);
  const out = raw.map((v) => Math.max(1, Math.floor(v)));
  let left = n - out.reduce((a, b) => a + b, 0);
  const order = raw.map((v, i) => [v - Math.floor(v), i] as const).sort((a, b) => b[0] - a[0]);
  for (let i = 0; left > 0 && order.length; i = (i + 1) % order.length) {
    out[order[i]![1]]!++;
    left--;
  }
  // more buckets than zones: hand the surplus back by dropping the emptiest
  while (out.reduce((a, b) => a + b, 0) > n) {
    const i = out.lastIndexOf(Math.min(...out));
    out.splice(i, 1);
  }
  return out;
}

/** An ellipse hugging the stage: a strict circle wastes space on wide screens. */
const circle: Layout = (n, { w, h, clearX, clearY }) => {
  const rx = Math.max(clearX, w / 2 - 60);
  const ry = Math.max(clearY, h / 2 - 60);
  return Array.from({ length: n }, (_, i) => {
    const a = -Math.PI / 2 + (i / n) * TAU; // start at the top, go clockwise
    return { x: Math.cos(a) * rx, y: Math.sin(a) * ry };
  });
};

/**
 * Wedges on the innermost ring of a full circle, before it spills into a second one.
 *
 * The hole of a radial menu is the circle that just contains the card, so it hugs whatever
 * card you give it. Equal wedges are the point — every choice is one flick, and every flick is
 * the same length — which is why it is a circle and not an ellipse. Past this many, a wedge
 * stops being aimable: a pie menu is a Fitts's-law device, and the target you cannot miss is
 * one with a wide angle.
 */
const RING_MAX = 8;

/** Width of the gutter between two wedges, in px — a distance, so it reads the same everywhere. */
const GUTTER = 6;

export interface RadialOptions {
  /** where the arc begins, in radians. `-π/2` is the top; angles run clockwise. */
  start?: number;
  /** how much of the circle to use: `2π` a full pie, `π` a half, `π/2` a quarter. */
  sweep?: number;
  /** space between two rings, in px */
  ringGap?: number;
  /** wedges on the innermost ring of a *full* circle — scaled by sweep and by radius */
  maxPerRing?: number;
}

/**
 * A radial menu, parameterised. `layouts.radial` is `radialLayout()` with the defaults.
 *
 * ```js
 * layout: radialLayout({ start: -Math.PI / 2, sweep: Math.PI })   // the right half
 * layout: radialLayout({ sweep: Math.PI / 2, start: Math.PI })    // a quarter, top-left
 * ```
 *
 * An arc rather than a full circle is not a decoration: it is what lets the menu live against
 * an edge, or beside a thumb, without wedges pointing off the screen. The capacity of a ring
 * scales with the arc it actually covers, so a half menu holds half as many wedges of the same
 * width rather than the same number of half-width ones.
 */
export function radialLayout(opts: RadialOptions = {}): Layout {
  const sweep = Math.max(0.35, Math.min(opts.sweep ?? TAU, TAU));
  const start = opts.start ?? -Math.PI / 2;
  const ringGap = Math.max(0, opts.ringGap ?? 3);
  const maxFirst = Math.max(2, opts.maxPerRing ?? RING_MAX);

  const place: Layout = (n, box): Placement => {
    const { w, h, cardW, cardH, tile } = box;
    const rIn = Math.hypot(cardW / 2, cardH / 2) + 12;
    // An arc does not need the stage centred on it: a half menu against the left edge has the
    // whole width to grow into. So the *unit* shape of the arc — the wedge fan plus its
    // vertex — is measured, fitted to the stage, and the hole ends up wherever that puts it.
    // A full circle measures [-1,1] on both axes and lands exactly where it always did.
    const xs = [0, Math.cos(start), Math.cos(start + sweep)];
    const ys = [0, Math.sin(start), Math.sin(start + sweep)];
    for (let k = -4; k <= 8; k++) {
      const a = (k * Math.PI) / 2; // a cardinal direction inside the arc reaches the unit circle
      if (a >= start && a <= start + sweep) {
        xs.push(Math.cos(a));
        ys.push(Math.sin(a));
      }
    }
    const [x0, x1] = [Math.min(...xs), Math.max(...xs)];
    const [y0, y1] = [Math.min(...ys), Math.max(...ys)];
    // The card lives in the hole, so it is part of the shape being fitted: a quarter menu
    // pushed hard into a corner would otherwise hang half the card off the stage. Three
    // passes, because shrinking the radius shrinks the arc but never the card.
    const [availW, availH] = [w - 12, h - 12];
    let fit = Math.min(availW / (x1 - x0), availH / (y1 - y0));
    const span = (r: number) => ({
      lx: Math.min(r * x0, -cardW / 2),
      rx: Math.max(r * x1, cardW / 2),
      ty: Math.min(r * y0, -cardH / 2),
      by: Math.max(r * y1, cardH / 2),
    });
    for (let pass = 0; pass < 3; pass++) {
      const { lx, rx, ty, by } = span(fit);
      const k = Math.min(1, availW / (rx - lx), availH / (by - ty));
      if (k > 0.999) break;
      fit *= k;
    }
    const { lx, rx, ty, by } = span(fit);
    const centre = { x: -(lx + rx) / 2, y: -(ty + by) / 2 };
    const rOut = Math.max(rIn + 76, fit);
    const share2 = (caps: number[]) => share(n, caps);

    // A ring thinner than a tile is not a ring: the labels of two of them sit on top of each
    // other. So the band decides how many rings there is room for, and when that is not enough
    // to hold every zone at the ideal wedge width, the wedges get narrower rather than the
    // menu growing a ring it cannot draw.
    // A ring must be thick enough to draw a tile in — but a crowded tile shrinks (the deck
    // scales it down rather than let two overlap), so the floor is the smallest one, not the
    // roomiest. Otherwise sixteen zones are squeezed onto a single ring that cannot hold them.
    const maxRings = Math.max(1, Math.min(4, n, Math.floor((rOut - rIn) / Math.max(56, tile * 0.5))));
    const capsFor = (rings: number) => {
      const t = (rOut - rIn) / rings;
      return Array.from({ length: rings }, (_, k) =>
        Math.max(2, Math.round((maxFirst * (sweep / TAU) * (rIn + (k + 0.5) * t)) / (rIn + 0.5 * t))),
      );
    };
    // The smallest number of rings that can hold them at an aimable width. A wedge much
    // narrower than a ring's share stops being a Fitts's-law target, and the tiles themselves
    // give up their keycap and shrink their glyph rather than force another ring.
    let counts = share2(capsFor(maxRings));
    for (let rings = 1; rings <= maxRings; rings++) {
      const caps = capsFor(rings);
      if (caps.reduce((a, b) => a + b, 0) >= n) {
        counts = share2(caps);
        break;
      }
    }

    const thickness = (rOut - rIn) / counts.length;
    const SAMPLES = 14;
    const points: Point[] = [];
    const cells: Polygon[] = [];

    counts.forEach((count, ring) => {
      const r0 = rIn + ring * thickness;
      const r1 = r0 + thickness - (ring < counts.length - 1 ? ringGap : 0);
      const step = sweep / count;
      /* The gutter between two wedges is a **distance**, not an angle. A constant angle looks
         like a hairline at the hole and a wide slot at the rim, because the sides of adjacent
         wedges diverge; taking `gutter / r` as the angular inset at each radius keeps the two
         facing sides the same distance apart all the way along — parallel, which is what the
         eye was expecting from a menu drawn out of rings. */
      const gutter = Math.min(GUTTER, step * r0 * 0.5);
      const inset = (r: number) => Math.min(gutter / (2 * r), step / 3);
      for (let i = 0; i < count; i++) {
        const mid = start + (i + 0.5) * step;
        const outer = [mid - step / 2 + inset(r1), mid + step / 2 - inset(r1)];
        const inner = [mid - step / 2 + inset(r0), mid + step / 2 - inset(r0)];
        const poly: Polygon = [];
        for (let s2 = 0; s2 <= SAMPLES; s2++) {
          const a = outer[0]! + ((outer[1]! - outer[0]!) * s2) / SAMPLES;
          poly.push([centre.x + Math.cos(a) * r1, centre.y + Math.sin(a) * r1]);
        }
        for (let s2 = SAMPLES; s2 >= 0; s2--) {
          const a = inner[0]! + ((inner[1]! - inner[0]!) * s2) / SAMPLES;
          poly.push([centre.x + Math.cos(a) * r0, centre.y + Math.sin(a) * r0]);
        }
        cells.push(poly);
        // The wedge starts at the card's own circle, but the *label* sits in the middle of it,
        // and on the first ring that middle can still fall across a corner of the card. So the
        // tile is pushed out along its own angle — which keeps it inside its own wedge — until
        // it clears the card's rectangle. A full circle hid this; an arc shows it at once.
        const mid2 = (r0 + r1) / 2;
        const clear = clearanceAt(mid, box) + 4;
        // clamped to the outer edge of its own wedge, not half a tile inside it: on a ring
        // thinner than a tile no radius keeps the whole label in, and clearing the card is the
        // one that matters — the same trade the other layouts make.
        /* …and never further out than the stage can hold a tile. Without that the generic
           per-axis clamp pulls the label back inside afterwards, and a ring of six comes out
           as a square of six: every tile on an edge, none at the angle of its own wedge. */
        const rMax = Math.max(rIn + 4, Math.min(w, h) / 2 - tile / 2 - pad(box));
        const fit = Math.min(Math.max(mid2, clear), Math.max(mid2, r1));
        // clearance still wins over the margin, as it does everywhere else
        const r = Math.max(clear, Math.min(fit, rMax));
        points.push({ x: centre.x + Math.cos(mid) * r, y: centre.y + Math.sin(mid) * r });
      }
    });
    return { points, cells, centre };
  };
  return name(place, 'radial');
}

const radial = radialLayout();

/**
 * Phyllotactic spiral, then relaxed: the seeds step by the golden angle so they are never
 * collinear, and Lloyd's algorithm then evens out the cells they produce.
 *
 * Without the relaxation the mosaic is pretty and unusable — the spiral crowds the middle,
 * so the first zones get postage stamps and the last ones get half the stage. Lloyd is the
 * standard fix (a centroidal Voronoi tessellation): compute the cells, move each seed to its
 * cell's centroid, repeat. Four passes is enough to make the areas comparable, and it stays
 * deterministic.
 */
const mosaic: Layout = (n, box) => {
  const { w, h, clearX, clearY } = box;
  const maxX = Math.max(clearX, w / 2 - 70);
  const maxY = Math.max(clearY, h / 2 - 70);
  const seeds = Array.from({ length: n }, (_, i) => {
    const a = i * 2.399963229728653; // golden angle, in radians
    const t = Math.sqrt((i + 0.5) / n); // square root: constant density, no crowding at the rim
    return {
      x: Math.cos(a) * (clearX + t * (maxX - clearX)),
      y: Math.sin(a) * (clearY + t * (maxY - clearY)),
    };
  });
  return relax(seeds, box);
};

/**
 * A grid that looks like a grid: `n` rectangles tiling the whole stage, no gaps, no leftover
 * cell. Rows are chosen from the stage's aspect ratio and the zones shared out between them,
 * so five zones give a row of three over a row of two rather than a 3×2 grid with a hole.
 *
 * The card floats over the middle, so a tile whose cell centre falls behind it slides outward
 * **within its own cell** — moving it to a ring, as the other layouts do, is exactly what made
 * the grid stop looking like a grid.
 */
const grid: Layout = (n, box): Placement => {
  const { w, h, tile } = box;
  const rows = Math.max(1, Math.min(n, Math.round(Math.sqrt((n * h) / w)) || 1));
  const perRow = share(n, Array.from({ length: rows }, () => 1));
  const rowH = h / perRow.length;
  const points: Point[] = [];
  const cells: Polygon[] = [];

  perRow.forEach((cols, r) => {
    const cellW = w / cols;
    const y0 = -h / 2 + r * rowH;
    const y1 = y0 + rowH;
    for (let c = 0; c < cols; c++) {
      const x0 = -w / 2 + c * cellW;
      const x1 = x0 + cellW;
      cells.push([
        [x0, y0],
        [x1, y0],
        [x1, y1],
        [x0, y1],
      ]);
      points.push(slideOut({ x: (x0 + x1) / 2, y: (y0 + y1) / 2 }, { x0, x1, y0, y1 }, box));
    }
  });
  return { points, cells };
};

/** Moves a point out of the card, but no further than its own cell allows. */
function slideOut(p: Point, cell: { x0: number; x1: number; y0: number; y1: number }, box: LayoutBox): Point {
  if (Math.abs(p.x) >= box.clearX || Math.abs(p.y) >= box.clearY) return p;
  const a = Math.hypot(p.x, p.y) < 1 ? -Math.PI / 2 : Math.atan2(p.y, p.x);
  const r = clearanceAt(a, box) + 4;
  const m = box.tile / 2;
  const clamp = (v: number, lo: number, hi: number) => (lo > hi ? (lo + hi) / 2 : Math.min(Math.max(v, lo), hi));
  return {
    x: clamp(Math.cos(a) * r, cell.x0 + m, cell.x1 - m),
    y: clamp(Math.sin(a) * r, cell.y0 + m, cell.y1 - m),
  };
}

/**
 * A dock: the zones line the bottom edge, and each one owns a full-height column.
 *
 * This is the phone layout. A ring of tiles around a card spends most of a tall screen on
 * empty corners; a dock spends all of it on the card, and turns the gesture into a horizontal
 * flick, which is the one a thumb makes best. It suits a handful of zones — past what fits
 * along the bottom, the tiles start to touch.
 */
export interface DockOptions {
  /** put half the zones along the top edge too, which doubles what a dock can hold */
  split?: boolean;
  /** rows per edge; by default, as many as the tiles need to fit across the stage */
  rows?: number;
}

/**
 * A dock: the zones line an edge, and each one owns a column of the stage.
 *
 * This is the phone layout. A ring of tiles around a card spends most of a tall screen on
 * empty corners; a dock spends all of it on the card, and turns the gesture into a flick,
 * which is the one a thumb makes best. `split` lines the top edge as well: twice the zones,
 * and the regions become a top half and a bottom half rather than full-height columns.
 */
export function dockLayout(opts: DockOptions = {}): Layout {
  const place: Layout = (n, { w, h, tile }): Placement => {
    const points: Point[] = [];
    const cells: Polygon[] = [];
    const perRow = Math.max(1, Math.floor(w / (tile + 6)));
    const band = tile + 8;

    /** One edge of the stage: rows of tiles stacked inward from it, columns within each row. */
    const edge = (count: number, from: number, top: boolean, y0: number, y1: number) => {
      // six tiles on a phone do not fit across 390px: they wrap into rows instead of spilling
      // off both sides, which is what a tray does and what a single row cannot
      const rows = share(count, Array.from({ length: Math.max(1, opts.rows ?? Math.ceil(count / perRow)) }, () => 1));
      let k = from;
      rows.forEach((cols, r) => {
        // the innermost row swallows the rest of the stage, so every drop lands somewhere:
        // there is no gap between the tray and the card for a card to die in
        const last = r === rows.length - 1;
        const near = top ? y0 + r * band : y1 - r * band; // the edge-most side of this row
        const far = last ? (top ? y1 : y0) : near + (top ? band : -band);
        const [a, b] = top ? [near, far] : [far, near];
        const y = top ? near + tile / 2 + 4 : near - tile / 2 - 4;
        const colW = w / cols;
        for (let i = 0; i < cols; i++) {
          const x0 = -w / 2 + i * colW;
          const x1 = x0 + colW;
          cells[k] = [
            [x0, a],
            [x1, a],
            [x1, b],
            [x0, b],
          ];
          points[k] = { x: (x0 + x1) / 2, y };
          k++;
        }
      });
    };

    if (!opts.split || n < 2) edge(n, 0, false, -h / 2, h / 2);
    else {
      // the top edge takes the surplus, so an odd count keeps the bottom row easiest to reach
      const top = Math.ceil(n / 2);
      edge(top, 0, true, -h / 2, 0);
      edge(n - top, top, false, 0, h / 2);
    }
    return { points, cells };
  };
  return name(place, 'dock');
}

const dock = dockLayout();

/** Whatever fits: a dock on a narrow stage, a circle everywhere else. */
const auto: Layout = (n, box) => {
  const perRow = Math.max(1, Math.floor(box.w / (box.tile + 6)));
  const narrow = box.w < 620 || box.h / box.w > 1.15;
  // past two rows the tray eats the card's room, and a ring is the better spend
  return (narrow && n <= perRow * 2 ? dock : circle)(n, box);
};

export const layouts: Record<string, Layout> = { auto, circle, radial, voronoi: mosaic, grid, dock };

// --- shared post-steps ---------------------------------------------------------

/** Area and centroid of a polygon, by the shoelace formula. */
function centroid(poly: Polygon): Point | null {
  let a = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xj, yj] = poly[j]!;
    const [xi, yi] = poly[i]!;
    const f = xj * yi - xi * yj;
    a += f;
    cx += (xj + xi) * f;
    cy += (yj + yi) * f;
  }
  if (Math.abs(a) < 1e-6) return null;
  return { x: cx / (3 * a), y: cy / (3 * a) };
}

/**
 * Lloyd's algorithm: move every seed to the centroid of its own cell, a few times over.
 *
 * The clearance is reapplied after each pass, otherwise the seeds drift into the middle —
 * the centre of the stage is the largest empty area, and it is exactly where the card is.
 */
export function relax(pts: Point[], box: LayoutBox, iterations = 4): Point[] {
  const { w, h } = box;
  let seeds = clearCentre(pts, box);
  for (let k = 0; k < iterations; k++) {
    const abs = seeds.map((p) => ({ x: w / 2 + p.x, y: h / 2 + p.y }));
    seeds = clearCentre(
      voronoi(abs, w, h).map((cell, i) => {
        const c = centroid(cell);
        return c ? { x: c.x - w / 2, y: c.y - h / 2 } : seeds[i]!;
      }),
      box,
    );
  }
  return seeds;
}

/**
 * How far out a zone has to sit, in the direction `a`, to be clear of the card.
 *
 * A **rectangle**, not an ellipse: cards are rectangles and so are tiles, and an ellipse cuts
 * the corners — a tile at 45° sat outside the ellipse and still overlapped the card. This is
 * the ray hitting the card's box inflated by half a tile, which is the exact condition.
 */
export function clearanceAt(a: number, { clearX, clearY }: LayoutBox): number {
  const c = Math.abs(Math.cos(a));
  const s = Math.abs(Math.sin(a));
  return Math.min(c < 1e-6 ? Infinity : clearX / c, s < 1e-6 ? Infinity : clearY / s);
}

/** Pushes any seed that landed inside the card out to the edge of it. */
/**
 * The breathing room a tile keeps from the edge of the stage, on top of its own half-width.
 *
 * A tile flush against the edge is legal and unpleasant: it reads as clipped, and on a phone
 * it sits under the browser's own edge gestures. Twelve pixels is the default; `zonePadding`
 * moves it.
 */
const pad = (box: LayoutBox): number => Math.max(0, box.pad ?? 12);

/**
 * Pulls the tiles in towards the card by `k` of their distance.
 *
 * Zones spread to the far corners are all *reachable* and none of them are *readable*: the eye
 * has to travel to each label in turn. Drawing them in around the pile makes the whole set
 * take one glance, and — since the carving is derived from where the tiles are — the regions
 * follow, so the drop targets stay exactly where they look. `clearCentre()` runs after, so
 * nothing lands on the card.
 */
export function pullToCard(pts: Point[], k: number): Point[] {
  const t = Math.min(Math.max(k, 0), 0.8);
  return t ? pts.map((p) => ({ x: p.x * (1 - t), y: p.y * (1 - t) })) : pts;
}

/** How far out the stage still lets a tile sit, in direction `a`. Same ray/rectangle idea as
 *  `clearanceAt`, from the other side: one says « no closer », this one says « no further ». */
export function stageAt(a: number, box: LayoutBox): number {
  const maxX = Math.max(box.w / 2 - box.tile / 2 - pad(box), 20);
  const maxY = Math.max(box.h / 2 - box.tile / 2 - pad(box), 20);
  const c = Math.abs(Math.cos(a));
  const s = Math.abs(Math.sin(a));
  return Math.min(c < 1e-6 ? Infinity : maxX / c, s < 1e-6 ? Infinity : maxY / s);
}

/**
 * Pushes every seed out of the card — and, when a direction has no room left, **turns it**
 * instead of pushing it.
 *
 * A card that fills the height of the stage (a cover image and six lines of title do exactly
 * that) leaves nothing above or below it. Pushing a tile out along its own direction would
 * send it off the stage; clamping it back afterwards would drop it onto the card, which is the
 * bug this function exists to prevent. So a tile with nowhere to stand rotates towards the
 * nearer horizontal — where the card is only as wide as it is wide — until it finds room.
 */
export function clearCentre(pts: Point[], box: LayoutBox): Point[] {
  return pts.map((p, i) => {
    // exactly at the centre there is no direction to push along, so borrow one from the index
    const a0 = Math.hypot(p.x, p.y) < 1 ? (i / Math.max(pts.length, 1)) * TAU - Math.PI / 2 : Math.atan2(p.y, p.x);
    let a = a0;
    if (clearanceAt(a, box) > stageAt(a, box)) {
      const target = Math.cos(a) >= 0 ? 0 : Math.sign(a || 1) * Math.PI; // the nearer horizontal
      const STEPS = 24;
      a = target;
      for (let k = 1; k <= STEPS; k++) {
        const b = a0 + (target - a0) * (k / STEPS);
        if (clearanceAt(b, box) <= stageAt(b, box)) {
          a = b;
          break;
        }
      }
    }
    const r = clearanceAt(a, box);
    const cur = Math.hypot(p.x, p.y);
    if (a === a0 && cur >= r - 0.5) return p;
    // rotated: keep the distance it had, as long as it is legal in the new direction
    const rr = a === a0 ? r : Math.max(r, Math.min(cur, stageAt(a, box)));
    return { x: Math.cos(a) * rr, y: Math.sin(a) * rr };
  });
}

/**
 * Scales the whole set down until it fits the stage, tile included.
 *
 * Uniform, so the arrangement is preserved: clamping each point separately would fold a
 * circle into a rectangle. A zone half off the stage is unreachable by thumb, which is the
 * same failure as a zone under the card, from the other side.
 */
/**
 * Pulls each point back inside the stage, one axis at a time.
 *
 * For a layout that draws its own regions, scaling the whole set would slide the labels out
 * of the very wedges they belong to; clamping moves a label along the axis that overflows and
 * leaves it on its own ray. The outer ring of a radial menu needs this — its mid-radius is
 * where the label goes, and that can sit past the bottom edge.
 */
export function clampToStage(pts: Point[], box: LayoutBox): Point[] {
  const maxX = Math.max(box.w / 2 - box.tile / 2 - pad(box), 20);
  const maxY = Math.max(box.h / 2 - box.tile / 2 - pad(box), 20);
  return pts.map((p) => ({
    x: Math.min(Math.max(p.x, -maxX), maxX),
    y: Math.min(Math.max(p.y, -maxY), maxY),
  }));
}

export function fitToStage(pts: Point[], box: LayoutBox): Point[] {
  const maxX = Math.max(box.w / 2 - box.tile / 2 - pad(box), 20);
  const maxY = Math.max(box.h / 2 - box.tile / 2 - pad(box), 20);
  let k = 1;
  for (const p of pts) {
    if (Math.abs(p.x) > maxX) k = Math.min(k, maxX / Math.abs(p.x));
    if (Math.abs(p.y) > maxY) k = Math.min(k, maxY / Math.abs(p.y));
  }
  return k === 1 ? pts : pts.map((p) => ({ x: p.x * k, y: p.y * k }));
}

/**
 * `'auto'` (default), `'circle'`, `'radial'`, `'voronoi'`, `'grid'`, `'dock'` or your own.
 *
 * Whatever comes back goes through the same two guarantees — nothing under the card, nothing
 * off the stage — so a custom layout gets them for free. A layout that draws its own regions
 * is trusted with its own labels: pushing them out would move them out of the very wedges
 * they belong to.
 */
export function resolveLayout(l: Layout | string | undefined): (n: number, box: LayoutBox) => Placement {
  const place = typeof l === 'function' ? l : (layouts[l ?? 'auto'] ?? auto);
  return (n, box) => {
    const out = place(n, box);
    const raw = Array.isArray(out) ? { points: out } : out;
    if (raw.cells) return { points: clampToStage(raw.points, box), cells: raw.cells, ...(raw.centre ? { centre: raw.centre } : {}) };
    // Fit, gather, clear — in that order. When fit and clearance cannot both hold — a tall card
    // on a short stage — the clearance is the one that must win: a tile poking past the edge is
    // untidy, a tile under the card is invisible and unreachable. The gathering in between is
    // what keeps a floating set readable at a glance instead of scattered to the corners.
    return { points: clearCentre(pullToCard(fitToStage(raw.points, box), box.pull ?? 0), box) };
  };
}

/** Angle of a vector, wrapped into [0, 2π[. */
export const angleOf = (x: number, y: number): number => (Math.atan2(y, x) + TAU) % TAU;

/** Absolute angular gap between two angles, in [0, π]. */
export const angleGap = (a: number, b: number): number => {
  const d = Math.abs(a - b) % TAU;
  return d > Math.PI ? TAU - d : d;
};

export { onEllipse };
