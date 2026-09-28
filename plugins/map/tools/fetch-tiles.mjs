#!/usr/bin/env node
// Downloads a small region of vector tiles (Mapbox Vector Tile, OpenMapTiles schema) into <out>/z/x/y.pbf,
// uncompressed, for zinc:map's offline source. Default source: OpenFreeMap (no API key). Be polite: small regions,
// low concurrency; existing files are skipped, so reruns only fetch what is missing.
//
//   node plugins/map/tools/fetch-tiles.mjs --bbox 2.30,48.845,2.37,48.87 --zoom 10-14 --out tiles
//   options: --source <tilejson url> (default https://tiles.openfreemap.org/planet)  --concurrency 2  --dry-run
//            --drop poi,housenumber   remove unused layers (POIs are ~75% of a dense z14 tile)
//
// Data © OpenStreetMap contributors (ODbL), tiles by OpenFreeMap / OpenMapTiles.
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as zlib from 'node:zlib';

const args = {};
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (!a.startsWith('--')) continue;
  const v = process.argv[i + 1];
  if (v === undefined || v.startsWith('--')) args[a.slice(2)] = 'true'; else { args[a.slice(2)] = v; i++; }
}
if (!args.bbox || !args.out) {
  console.error('usage: fetch-tiles.mjs --bbox west,south,east,north --zoom 10-14 --out <dir> [--source url] [--concurrency 2] [--dry-run]');
  process.exit(2);
}
const [west, south, east, north] = args.bbox.split(',').map(Number);
const [zmin, zmax] = (args.zoom ?? '10-14').split('-').map(Number);
const source = args.source ?? 'https://tiles.openfreemap.org/planet';
const conc = Math.max(1, Math.min(4, Number(args.concurrency ?? 2)));
const drop = new Set((args.drop ?? '').split(',').filter(Boolean));
const UA = 'zinc-map-fetch/0.1 (offline region for zinc:map)';

const lon2x = (lon, z) => Math.floor((lon + 180) / 360 * 2 ** z);
const lat2y = (lat, z) => { const r = lat * Math.PI / 180; return Math.floor((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * 2 ** z); };

const tj = await (await fetch(source, { headers: { 'User-Agent': UA } })).json();
const template = tj.tiles[0], maxzoom = tj.maxzoom ?? 14;
const jobs = [];
for (let z = zmin; z <= Math.min(zmax, maxzoom); z++)
  for (let x = lon2x(west, z); x <= lon2x(east, z); x++)
    for (let y = lat2y(north, z); y <= lat2y(south, z); y++) jobs.push([z, x, y]);
if (zmax > maxzoom) console.log(`source max zoom is ${maxzoom}: zinc:map overzooms beyond it`);
console.log(`${jobs.length} tiles, zoom ${zmin}-${Math.min(zmax, maxzoom)}, from ${template}`);
if (jobs.length > 400 && args.force !== 'true') { console.error('more than 400 tiles: pick a smaller region (or --force, and be kind to the server)'); process.exit(1); }
if (args['dry-run'] === 'true') process.exit(0);

/** Keeps the tile's layers (field 3) whose name (layer field 1) is not in `drop`; bytes are copied as is. */
function dropLayers(buf) {
  let p = 0;
  const varint = () => { let r = 0, m = 1, c; do { c = buf[p++]; r += (c & 127) * m; m *= 128; } while (c & 128); return r; };
  const keep = [];
  while (p < buf.length) {
    const start = p, key = varint();
    if ((key & 7) !== 2) throw new Error('unexpected tile field');
    const len = varint(), body = p;
    p += len;
    if (key >> 3 === 3) {
      let q = body, name = '';
      while (q < p && !name) {
        const save = p; p = q;
        const k = varint(), t = k & 7;
        if (t === 2) { const l = varint(); if (k >> 3 === 1) name = buf.toString('utf8', p, p + l); p += l; }
        else if (t === 0) varint(); else p += t === 5 ? 4 : 8;
        q = p; p = save;
      }
      if (drop.has(name)) continue;
    }
    keep.push(buf.subarray(start, p));
  }
  return Buffer.concat(keep);
}

let done = 0, bytes = 0, skipped = 0;
async function worker() {
  while (jobs.length) {
    const [z, x, y] = jobs.shift();
    const file = path.join(args.out, String(z), String(x), `${y}.pbf`);
    if (fs.existsSync(file)) { skipped++; continue; }
    const url = template.replace('{z}', z).replace('{x}', x).replace('{y}', y);
    let buf;
    for (let attempt = 0; ; attempt++) {
      const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Encoding': 'gzip' } });  // fetch inflates HTTP gzip
      if (r.ok) { buf = Buffer.from(await r.arrayBuffer()); break; }
      if (r.status === 404 || r.status === 204) { buf = Buffer.alloc(0); break; }  // empty tile (outside the data)
      if (attempt === 3) throw new Error(`${url}: HTTP ${r.status}`);
      await new Promise(res => setTimeout(res, 1000 * 2 ** attempt));
    }
    if (buf[0] === 0x1f && buf[1] === 0x8b) buf = zlib.gunzipSync(buf);  // gzip inside the payload (mbtiles style)
    if (drop.size) buf = dropLayers(buf);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, buf);
    done++; bytes += buf.length;
    process.stdout.write(`\r${done} fetched, ${skipped} skipped, ${(bytes / 1048576).toFixed(1)} MiB`);
    await new Promise(res => setTimeout(res, 100));  // politeness
  }
}
await Promise.all(Array.from({ length: conc }, worker));
console.log(`\n${done} fetched, ${skipped} already present -> ${args.out}`);
