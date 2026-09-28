#!/usr/bin/env node
// Builds the navigation demo's offline data from OpenStreetMap:
//   assets/city.bin     the background map as vector geometry (roads by class, water, parks, buildings)
//   src/route-data.ts   the drive: the route polyline, speed limits and turn-by-turn steps
//
// Inputs:
//   - streets: an Overpass API extract of the drivable (and pedestrian) highways of central Paris, with node ids,
//     names, one-way, access, maxspeed, junction and turn:lanes tags. `--fetch` downloads it (once) into the cache.
//   - areas: the offline vector tiles of examples/maps/explorer (OpenMapTiles z14: water, park, landcover, building).
// The route is computed here, not drawn by hand: a shortest-time path (Dijkstra over the OSM street graph, one-way
// streets and access restrictions respected) through a few waypoints, then turned into instructions (turn angles,
// roundabout exit counts, lanes from turn:lanes).
//
//   node examples/maps/navigation/tools/build-data.mjs --fetch            # download the streets (~6 MB) then build
//   node examples/maps/navigation/tools/build-data.mjs                    # rebuild from the cached extract
//
// Data © OpenStreetMap contributors (ODbL).
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const project = path.join(here, '..');
const cache = path.join(project, 'build', 'osm-streets.json');
const tilesDir = path.join(project, '..', 'explorer', 'tiles', '14');

// ---------------------------------------------------------------- region, projection
const BBOX = { south: 48.846, west: 2.284, north: 48.880, east: 2.356 };
const LAT0 = 48.862, LON0 = 2.320;                    // local origin (metres east / south of it)
const KX = Math.cos(LAT0 * Math.PI / 180) * 111319.49, KY = 111132.95;
const proj = (lat, lon) => [(lon - LON0) * KX, (LAT0 - lat) * KY];   // y grows to the south, like the screen
const UNIT = 4;                                        // city.bin stores int16 quarter metres (±8 km)

// ---------------------------------------------------------------- the drive: waypoints in order
const WAYPOINTS = [   // [lat, lon, street to snap to]
  [48.85730, 2.33950, 'Quai de Conti'],
  [48.86370, 2.31960, 'Pont de la Concorde'],
  [48.87000, 2.30700, 'Avenue des Champs-Élysées'],
  [48.87280, 2.29470, 'Place Charles de Gaulle'],
  [48.87000, 2.29650, "Avenue d'Iéna"],
  [48.86350, 2.30500, 'Cours Albert-Iᵉʳ'],
  [48.86250, 2.32900, 'Quai des Tuileries'],
  [48.85770, 2.34600, 'Quai de la Mégisserie'],
];

// ---------------------------------------------------------------- 1. streets from Overpass
if (process.argv.includes('--fetch') && !fs.existsSync(cache)) {
  const classes = 'motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|service|pedestrian|motorway_link|trunk_link|primary_link|secondary_link|tertiary_link';
  const q = `[out:json][timeout:180];way["highway"~"^(${classes})$"](${BBOX.south},${BBOX.west},${BBOX.north},${BBOX.east});out body;>;out skel qt;`;
  const server = process.env.OVERPASS ?? 'https://overpass.private.coffee/api/interpreter';
  console.log(`fetching streets from ${server}...`);
  const r = await fetch(server, { method: 'POST', body: new URLSearchParams({ data: q }), headers: { 'User-Agent': 'zinc-navigation-demo/0.1 (offline route builder)' } });
  const text = await r.text();
  if (!r.ok || !text.startsWith('{')) { console.error(`overpass: HTTP ${r.status}, try again later or set OVERPASS=<server>`); process.exit(1); }
  fs.mkdirSync(path.dirname(cache), { recursive: true });
  fs.writeFileSync(cache, text);
}
if (!fs.existsSync(cache)) { console.error(`missing ${cache}: run with --fetch`); process.exit(1); }
const osm = JSON.parse(fs.readFileSync(cache, 'utf8'));
const nodes = new Map();     // id -> [x, y]
for (const e of osm.elements) if (e.type === 'node') nodes.set(e.id, proj(e.lat, e.lon));
const ways = osm.elements.filter((e) => e.type === 'way' && e.nodes.every((n) => nodes.has(n)));

// ---------------------------------------------------------------- 2. street graph and routing
const SPEED = { motorway: 70, trunk: 50, primary: 40, secondary: 35, tertiary: 30, unclassified: 25, residential: 22, living_street: 10 };
const baseClass = (h) => h.replace('_link', '');
const blocked = (t) => ['no', 'private', 'permit', 'destination;permit', 'delivery', 'customers'].includes(t.motor_vehicle ?? t.motorcar ?? t.vehicle ?? t.access ?? '');
const isRoundabout = (t) => t.junction === 'roundabout' || t.junction === 'circular';
const drivable = (t) => SPEED[baseClass(t.highway)] !== undefined && !blocked(t) && t.area !== 'yes';
const onewayOf = (t) => t.oneway === 'yes' || t.oneway === '1' || t.oneway === 'true' ? 1 : t.oneway === '-1' ? -1 : isRoundabout(t) ? 1 : 0;
const dist = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);

const adj = new Map();       // node id -> [{ to, way, cost, len }]
const edge = (a, b, w, cost, len) => { if (!adj.has(a)) adj.set(a, []); adj.get(a).push({ to: b, way: w, cost, len }); };
for (const w of ways) {
  const t = w.tags;
  if (!drivable(t)) continue;
  const one = onewayOf(t);
  const kmh = SPEED[baseClass(t.highway)] * (t.motor_vehicle === 'destination' || t.access === 'destination' ? 0.2 : 1);
  for (let i = 0; i + 1 < w.nodes.length; i++) {
    const a = w.nodes[i], b = w.nodes[i + 1], len = dist(nodes.get(a), nodes.get(b)), cost = len / kmh;
    if (one >= 0) edge(a, b, w, cost, len);
    if (one <= 0) edge(b, a, w, cost, len);
  }
}
/** The node of a drivable way named `street` closest to (lat, lon). */
function nearestNode(lat, lon, street) {
  const p = proj(lat, lon);
  let best = -1, bd = Infinity;
  for (const [id, edges] of adj) {
    if (!edges.some((e) => e.way.tags.name === street)) continue;
    const d = dist(p, nodes.get(id));
    if (d < bd) { bd = d; best = id; }
  }
  if (best < 0) throw new Error(`no street named ${street}`);
  return best;
}
/** Dijkstra from a to b: [{ node, way }] where way is the way used to reach the node. */
function shortest(a, b) {
  const cost = new Map([[a, 0]]), prev = new Map(), heap = [[0, a]];
  const push = (item) => { heap.push(item); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
  while (heap.length) {
    const [c, n] = pop();
    if (n === b) break;
    if (c > cost.get(n)) continue;
    for (const e of adj.get(n) ?? []) {
      const nc = c + e.cost;
      if (nc < (cost.get(e.to) ?? Infinity)) { cost.set(e.to, nc); prev.set(e.to, { from: n, way: e.way }); push([nc, e.to]); }
    }
  }
  if (!prev.has(b)) throw new Error(`no route to node ${b}`);
  const out = [];
  for (let n = b; n !== a; n = prev.get(n).from) out.push({ node: n, way: prev.get(n).way });
  return out.reverse();
}
const stops = WAYPOINTS.map(([lat, lon, street]) => nearestNode(lat, lon, street));
let hops = [{ node: stops[0], way: null }];
for (let i = 0; i + 1 < stops.length; i++) hops = hops.concat(shortest(stops[i], stops[i + 1]));
// a waypoint in the middle of a street can make the path come back on itself: remove such spurs (A B A -> A)
for (let changed = true; changed;) {
  changed = false;
  for (let i = 1; i + 1 < hops.length; i++) if (hops[i - 1].node === hops[i + 1].node) { hops.splice(i, 2); changed = true; break; }
}

// ---------------------------------------------------------------- 3. route geometry, limits, instructions
const pts = hops.map((h) => nodes.get(h.node));
const cum = [0];
for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + dist(pts[i - 1], pts[i]));
const total = cum[cum.length - 1];
const limitOf = (t) => { const v = parseInt(t?.maxspeed ?? '', 10); return Number.isFinite(v) ? v : 30; };   // Paris: 30 km/h by default
const nameOf = (t) => t?.name ?? t?.ref ?? '';

/** Direction of travel (radians, 0 = east, y south) over `span` metres before (-1) or after (+1) vertex i. */
function bearing(i, dir, span = 18) {
  let j = i;
  while (j + dir >= 0 && j + dir < pts.length && Math.abs(cum[j] - cum[i]) < span) j += dir;
  const [a, b] = dir < 0 ? [pts[j], pts[i]] : [pts[i], pts[j]];
  return Math.atan2(b[1] - a[1], b[0] - a[0]);
}
const wrap = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
const deg = (r) => Math.round(r * 180 / Math.PI);
/** Turn angle at vertex i in degrees, + = right (y points south, so a clockwise turn is positive). */
const turnAt = (i) => deg(wrap(bearing(i, 1) - bearing(i, -1)));
function classify(angle) {
  const a = Math.abs(angle), side = angle > 0 ? 'right' : 'left';
  if (a < 22) return { type: 'straight', side: '' };
  if (a < 55) return { type: 'slight', side };
  if (a < 140) return { type: 'turn', side };
  if (a < 165) return { type: 'sharp', side };
  return { type: 'uturn', side };
}
const ordinal = (n) => ['', '1st', '2nd', '3rd'][n] ?? `${n}th`;
const onto = (s) => s === '' ? '' : ` onto ${s}`;

/** Lanes on the way arriving at vertex i (turn:lanes in the direction of travel): "left|through|through;right". */
function lanesAt(i) {
  const w = hops[i].way;
  if (!w) return '';
  const t = w.tags, forward = w.nodes.indexOf(hops[i - 1]?.node ?? -1) < w.nodes.indexOf(hops[i].node);
  return (forward ? t['turn:lanes:forward'] ?? t['turn:lanes'] : t['turn:lanes:backward']) ?? '';
}
/** For each lane, whether it leads to the maneuver: "0110". */
function lanesFor(lanes, m) {
  const want = m.type === 'straight' ? ['through', 'none', ''] : m.side === 'left' ? ['left', 'slight_left', 'sharp_left'] : ['right', 'slight_right', 'sharp_right'];
  if (m.type === 'slight') want.push('through');
  return lanes.split('|').map((l) => l.split(';').some((v) => want.includes(v)) ? '1' : '0').join('');
}

const steps = [];
const addStep = (i, s) => steps.push({ at: Math.round(cum[i] * 10) / 10, ...s });
addStep(0, { type: 'depart', side: '', exit: 0, angle: 0, street: nameOf(hops[1].way.tags), text: `Head out on ${nameOf(hops[1].way.tags)}`, lanes: '', lanesOn: '' });
let i = 1;
while (i < hops.length - 1) {
  const cur = hops[i].way, next = hops[i + 1].way;
  if (!isRoundabout(cur.tags) && isRoundabout(next.tags)) {
    // roundabout: follow it to the exit, counting the drivable streets that leave it on the way
    const entry = i;
    let j = i + 1, exits = 0;
    while (j < hops.length - 1 && isRoundabout(hops[j + 1].way.tags)) {
      const n = hops[j].node;
      for (const e of adj.get(n) ?? []) if (!isRoundabout(e.way.tags) && e.to !== hops[j - 1].node) { exits++; break; }
      j++;
    }
    exits++;   // the exit taken
    const street = nameOf(hops[j + 1].way.tags), exitAngle = deg(wrap(bearing(j, 1) - bearing(entry, -1)));
    addStep(entry, { type: 'roundabout', side: 'right', exit: exits, angle: exitAngle, street, text: `At ${nameOf(next.tags) || 'the roundabout'}, take the ${ordinal(exits)} exit${onto(street)}`, lanes: '', lanesOn: '' });
    i = j + 1;
    continue;
  }
  const a = turnAt(i), m = classify(a);
  const n1 = nameOf(cur.tags), n2 = nameOf(next.tags);
  // a real choice: the street changes, or the road bends at a junction where other streets meet
  const junction = (adj.get(hops[i].node)?.length ?? 0) > 2;
  if ((n1 !== n2 && n2 !== '') || (m.type !== 'straight' && junction && Math.abs(a) > 40)) {
    const lanes = lanesAt(i);
    const verb = m.type === 'straight' ? 'Continue' : m.type === 'uturn' ? 'Make a U-turn' : m.type === 'slight' ? `Keep ${m.side}` : m.type === 'sharp' ? `Turn sharp ${m.side}` : `Turn ${m.side}`;
    addStep(i, { type: m.type, side: m.side, exit: 0, angle: a, street: n2, text: `${verb}${onto(n2)}`, lanes, lanesOn: lanes ? lanesFor(lanes, m) : '' });
  }
  i++;
}
// like Waze, say nothing when the road only changes its name (the street pill shows it); drop "jogs": a short
// right-left through a small square that lands back on the same street
for (let k = steps.length - 1; k >= 1; k--) if (steps[k].type === 'straight') steps.splice(k, 1);
for (let k = 1; k + 1 < steps.length; k++) {
  const a = steps[k], b = steps[k + 1];
  if (b.at - a.at < 200 && b.street === steps[k - 1].street && a.side !== b.side && a.type !== 'roundabout' && b.type !== 'roundabout') { steps.splice(k, 2); k--; }
}
const lastName = nameOf(hops[hops.length - 1].way.tags);
steps.push({ at: Math.round(total * 10) / 10, type: 'arrive', side: '', exit: 0, angle: 0, street: lastName, text: 'You have arrived', lanes: '', lanesOn: '' });

// the street name and speed limit of each route segment (i -> i + 1)
const segName = [], segLimit = [];
for (let k = 1; k < hops.length; k++) { segName.push(nameOf(hops[k].way.tags)); segLimit.push(limitOf(hops[k].way.tags)); }
const names = [...new Set(segName)];

// ---------------------------------------------------------------- 4. background: roads
const KIND = { park: 0, water: 1, building: 2, pedestrian: 3, service: 4, minor: 5, tertiary: 6, secondary: 7, primary: 8, tunnel: 9 };
function roadKind(t) {
  const c = baseClass(t.highway);
  if (t.tunnel === 'yes' || t.tunnel === 'building_passage' || (t.layer && parseInt(t.layer, 10) < 0 && t.bridge !== 'yes')) return KIND.tunnel;
  if (c === 'pedestrian' || c === 'living_street') return KIND.pedestrian;
  if (c === 'service') return KIND.service;
  if (c === 'residential' || c === 'unclassified') return KIND.minor;
  if (c === 'tertiary') return KIND.tertiary;
  if (c === 'secondary') return KIND.secondary;
  return KIND.primary;
}
/** Douglas-Peucker in metres. */
function simplify(p, tol) {
  if (p.length < 3) return p;
  const keep = new Uint8Array(p.length); keep[0] = keep[p.length - 1] = 1;
  const stack = [[0, p.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    let best = -1, bd = tol;
    const [ax, ay] = p[a], [bx, by] = p[b], L = Math.hypot(bx - ax, by - ay) || 1;
    for (let k = a + 1; k < b; k++) { const d = Math.abs((bx - ax) * (ay - p[k][1]) - (ax - p[k][0]) * (by - ay)) / L; if (d > bd) { bd = d; best = k; } }
    if (best > 0) { keep[best] = 1; stack.push([a, best], [best, b]); }
  }
  return p.filter((_, k) => keep[k]);
}
const features = [];   // { kind, rings: [[x, y]...][] }
// chain consecutive ways of the same kind (fewer, longer polylines), then cut them into short pieces for culling
const lineWays = ways.filter((w) => w.tags.area !== 'yes' && !(w.tags.highway === 'pedestrian' && w.nodes[0] === w.nodes[w.nodes.length - 1] && w.nodes.length > 3));
for (const w of lineWays) {
  const kind = roadKind(w.tags);
  const p = simplify(w.nodes.map((n) => nodes.get(n)), 0.4);
  let start = 0;
  for (let k = 1; k < p.length; k++) {
    let len = 0;
    for (let m = start + 1; m <= k; m++) len += dist(p[m - 1], p[m]);
    if (len > 120 || k === p.length - 1) { features.push({ kind, rings: [p.slice(start, k + 1)] }); start = k; }
  }
}

// ---------------------------------------------------------------- 5. background: areas from the vector tiles
function decodeTile(buf, tx, ty) {
  let p = 0;
  const varint = () => { let r = 0, m = 1, c; do { c = buf[p++]; r += (c & 127) * m; m *= 128; } while (c & 128); return r; };
  const skip = (t) => { if (t === 0) varint(); else if (t === 2) p += varint(); else p += t === 5 ? 4 : 8; };
  const out = [];
  while (p < buf.length) {
    const key = varint();
    if (key >> 3 !== 3) { skip(key & 7); continue; }
    const end = varint() + p;
    let name = '', extent = 4096;
    const keys = [], values = [], feats = [];
    while (p < end) {
      const k = varint(), f = k >> 3;
      if (f === 1) { const l = varint(); name = buf.toString('utf8', p, p + l); p += l; }
      else if (f === 3) { const l = varint(); keys.push(buf.toString('utf8', p, p + l)); p += l; }
      else if (f === 4) {
        const vend = varint() + p; let v = null;
        while (p < vend) { const vk = varint(); if (vk >> 3 === 1) { const l = varint(); v = buf.toString('utf8', p, p + l); p += l; } else skip(vk & 7); }
        values.push(v);
      } else if (f === 5) extent = varint();
      else if (f === 2) {
        const fend = varint() + p; let type = 0; const tags = [], geom = [];
        while (p < fend) {
          const fk = varint(), ff = fk >> 3;
          if (ff === 3) type = varint();
          else if (ff === 2 || ff === 4) { const pend = varint() + p; while (p < pend) (ff === 2 ? tags : geom).push(varint()); }
          else skip(fk & 7);
        }
        feats.push({ type, tags, geom });
      } else skip(k & 7);
    }
    for (const f of feats) {
      const props = {};
      for (let k = 0; k + 1 < f.tags.length; k += 2) props[keys[f.tags[k]]] = values[f.tags[k + 1]];
      // geometry commands -> rings in local metres
      const rings = []; let x = 0, y = 0, ring = null;
      for (let k = 0; k < f.geom.length;) {
        const cmd = f.geom[k] & 7, count = f.geom[k] >> 3; k++;
        if (cmd === 7) { if (ring) rings.push(ring); ring = null; continue; }
        for (let c = 0; c < count; c++) {
          x += (f.geom[k] >>> 1) ^ -(f.geom[k] & 1); y += (f.geom[k + 1] >>> 1) ^ -(f.geom[k + 1] & 1); k += 2;
          if (cmd === 1) { if (ring) rings.push(ring); ring = []; }
          const lon = (tx + x / extent) / 16384 * 360 - 180;
          const lat = Math.atan(Math.sinh(Math.PI * (1 - 2 * (ty + y / extent) / 16384))) * 180 / Math.PI;
          ring.push(proj(lat, lon));
        }
      }
      if (ring) rings.push(ring);
      out.push({ layer: name, type: f.type, props, rings });
    }
  }
  return out;
}
const nearCells = new Set();   // 100 m cells within ~500 m of the route
for (const [x, y] of pts) for (let dx = -5; dx <= 5; dx++) for (let dy = -5; dy <= 5; dy++) nearCells.add(`${Math.floor(x / 100) + dx},${Math.floor(y / 100) + dy}`);
const nearRoute = ([x, y]) => nearCells.has(`${Math.floor(x / 100)},${Math.floor(y / 100)}`);
const inRegion = (rings) => rings.some((r) => r.some(([x, y]) => { const lon = x / KX + LON0, lat = LAT0 - y / KY; return lon > BBOX.west - 0.003 && lon < BBOX.east + 0.003 && lat > BBOX.south - 0.002 && lat < BBOX.north + 0.002; }));
for (const tx of fs.readdirSync(tilesDir)) for (const f of fs.readdirSync(path.join(tilesDir, tx))) {
  const ty = parseInt(f, 10);
  for (const ft of decodeTile(fs.readFileSync(path.join(tilesDir, tx, f)), parseInt(tx, 10), ty)) {
    if (ft.type !== 3 || !inRegion(ft.rings)) continue;
    const green = ft.layer === 'park' || (ft.layer === 'landcover' && ['grass', 'wood'].includes(ft.props.class));
    const kind = ft.layer === 'water' ? KIND.water : green ? KIND.park : ft.layer === 'building' ? KIND.building : -1;
    if (kind < 0) continue;
    // a tile feature is a multipolygon: an outer ring (positive area, y down) starts a polygon, holes follow it
    let poly = null;
    for (const ring of ft.rings) {
      let area = 0;
      for (let k = 0; k < ring.length; k++) { const [ax, ay] = ring[k], [bx, by] = ring[(k + 1) % ring.length]; area += ax * by - bx * ay; }
      // buildings only near the route (the nav camera never shows the rest), and not the tiny ones
      const small = Math.abs(area) < (kind === KIND.building ? 60 : 8);   // m² x 2
      const r = small ? [] : simplify(ring, 1.2);
      const keep = r.length >= 3 && (kind !== KIND.building || nearRoute(ring[0]));
      if (area > 0) { poly = keep ? { kind, rings: [r] } : null; if (poly) features.push(poly); }
      else if (poly && keep) poly.rings.push(r);
    }
  }
}

// ---------------------------------------------------------------- 6. write city.bin and route-data.ts
// city.bin, little-endian: "CITY", u32 feature count, then per feature: u8 kind, u8 rings, per ring u16 points and
// i16 x, y pairs (quarter metres east / south of the origin).
features.sort((a, b) => a.kind - b.kind);
const bytes = [];
const u8 = (v) => bytes.push(v & 255), u16 = (v) => { u8(v); u8(v >> 8); }, i16 = (v) => u16(Math.max(-32768, Math.min(32767, Math.round(v))));
for (const c of 'CITY') u8(c.charCodeAt(0));
u16(features.length); u16(features.length >> 16);
for (const f of features) {
  const rings = f.rings.slice(0, 255);
  u8(f.kind); u8(rings.length);
  for (const r of rings) { u16(r.length); for (const [x, y] of r) { i16(x * UNIT); i16(y * UNIT); } }
}
fs.mkdirSync(path.join(project, 'assets'), { recursive: true });
fs.writeFileSync(path.join(project, 'assets', 'city.bin'), Buffer.from(bytes));

const r1 = (v) => Math.round(v * 10) / 10;
const ts = `// Generated by tools/build-data.mjs from OpenStreetMap data (© OpenStreetMap contributors, ODbL). Do not edit.
// A drive through central Paris, via ${WAYPOINTS.map((w) => w[2]).join(', ')}.
// Coordinates are metres east (x) and south (y) of ${LAT0}° N, ${LON0}° E.
import { Step } from './route';

/** Route polyline, [x0, y0, x1, y1, ...] in metres (${pts.length} points, ${Math.round(total)} m). */
export const ROUTE_POINTS: number[] = [${pts.map(([x, y]) => `${r1(x)}, ${r1(y)}`).join(', ')}];

/** Speed limit (km/h) of each segment i -> i + 1, from the OSM maxspeed tags. */
export const SEGMENT_LIMITS: i32[] = [${segLimit.join(', ')}];

/** Street of each segment, as an index in STREETS. */
export const SEGMENT_STREETS: i32[] = [${segName.map((n) => names.indexOf(n)).join(', ')}];
export const STREETS: string[] = [${names.map((n) => JSON.stringify(n)).join(', ')}];

/** Turn-by-turn steps: maneuver at distance \`at\` (m) along the route. */
export const STEPS: Step[] = [
${steps.map((s) => `  new Step(${s.at}, '${s.type}', '${s.side}', ${s.exit}, ${s.angle}, ${JSON.stringify(s.street)}, ${JSON.stringify(s.text)}, '${s.lanes}', '${s.lanesOn}'),`).join('\n')}
];
`;
fs.writeFileSync(path.join(project, 'src', 'route-data.ts'), ts);

// --svg <file>: an overview of the streets, the route and the steps, to check the route by eye
const svgAt = process.argv.indexOf('--svg');
if (svgAt > 0) {
  const pl = (p) => p.map(([x, y]) => `${x.toFixed(0)},${y.toFixed(0)}`).join(' ');
  const [x0, y0] = proj(BBOX.north, BBOX.west), [x1, y1] = proj(BBOX.south, BBOX.east);
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x0} ${y0} ${x1 - x0} ${y1 - y0}" width="${Math.round((x1 - x0) / 3)}" height="${Math.round((y1 - y0) / 3)}"><rect x="${x0}" y="${y0}" width="${x1 - x0}" height="${y1 - y0}" fill="#f4f1ea"/>`;
  for (const f of features) {
    if (f.kind <= KIND.building) svg += `<path d="${f.rings.map((r) => `M${pl(r)}Z`).join('')}" fill="${['#c8e6c0', '#aad3df', '#ddd6cf'][f.kind]}"/>`;
    else svg += `<polyline points="${pl(f.rings[0])}" fill="none" stroke="#bbb" stroke-width="${f.kind >= KIND.tertiary && f.kind !== KIND.tunnel ? 8 : 3}"/>`;
  }
  svg += `<polyline points="${pl(pts)}" fill="none" stroke="#1a73e8" stroke-width="12" stroke-linejoin="round" opacity="0.8"/>`;
  steps.forEach((s, k) => { let j = 0; while (j < pts.length - 1 && cum[j] < s.at - 0.1) j++; svg += `<circle cx="${pts[j][0]}" cy="${pts[j][1]}" r="20" fill="#e53935"/><text x="${pts[j][0] + 24}" y="${pts[j][1]}" font-size="60" fill="#b71c1c">${k}</text>`; });
  fs.writeFileSync(process.argv[svgAt + 1], svg + '</svg>');
}

const counts = {};
for (const f of features) counts[f.kind] = (counts[f.kind] ?? 0) + 1;
console.log(`route: ${pts.length} points, ${(total / 1000).toFixed(2)} km, ${steps.length} steps`);
for (const s of steps) console.log(`  ${String(Math.round(s.at)).padStart(5)} m  ${s.type.padEnd(10)} ${String(s.angle).padStart(4)}°  ${s.text}${s.lanes ? `  [${s.lanes} ${s.lanesOn}]` : ''}`);
console.log(`city.bin: ${features.length} features (${Object.entries(counts).map(([k, v]) => `${Object.keys(KIND)[k]} ${v}`).join(', ')}), ${(bytes.length / 1024).toFixed(0)} KiB`);
