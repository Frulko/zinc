// zinc:map in the browser: index.ts runs as it is (MapView, gestures, inertia, animations, the Web Mercator helpers) over web/map.js, the "MapEngine" on MapLibre GL JS. What differs is
// tile loading, which index.ts does with zinc:net and zinc:fs (raw sockets and files, none on a page): here a tile comes from the app's assets (`tiles/z/x/y.pbf`, put in assets/), or
// from the browser's fetch of `url` (a z/x/y template, or a TileJSON URL; the server must allow CORS, as OpenFreeMap does), through the browser's HTTP cache (no `cache` directory).
import { MapView as Base } from '../index';
import Engine from '../native/map.spec';
import { exists, readBytes } from 'zinc:assets';

export * from '../index';

const g: any = globalThis;

const binary = (b: Uint8Array): string => { let s = ''; for (let i = 0; i < b.length; i += 8192) s += String.fromCharCode.apply(null, Array.from(b.subarray(i, i + 8192))); return s; };
async function gunzip(b: Uint8Array): Promise<Uint8Array> {
  if (b.length < 2 || b[0] !== 0x1f || b[1] !== 0x8b || !g.DecompressionStream) return b;
  return new Uint8Array(await new g.Response(new g.Blob([b]).stream().pipeThrough(new g.DecompressionStream('gzip'))).arrayBuffer());
}
const base: any = Base;

export class MapView extends Base {
  private _open: number = 0;
  private _template: string = '';
  // index.ts's tile queue, over the page's fetch
  private pump(): void {
    const me: any = this;
    for (let i = 0; i < 8; i++) {
      if (me._open >= 6) return;
      const key: string = Engine.nextRequest();
      if (key === '') return;
      const file = `${me.opts.tiles}/${key}.pbf`;
      if (me.opts.tiles !== '' && exists(file)) Engine.provide(key, binary(new Uint8Array(readBytes(file))));
      else if (me.opts.url === '') Engine.provide(key, '');
      else { me._open++; me._load(key); }
    }
  }
  async _load(key: string): Promise<void> {
    const me: any = this;
    try {
      if (me._template === '') {
        if (me.opts.url.includes('{z}')) me._template = me.opts.url;
        else { const j = await (await g.fetch(me.opts.url)).json(); me._template = j.tiles[0]; }
      }
      const p = key.split('/');
      const r = await g.fetch(me._template.replace('{z}', p[0]).replace('{x}', p[1]).replace('{y}', p[2]));
      Engine.provide(key, r.ok ? binary(await gunzip(new Uint8Array(await r.arrayBuffer()))) : '');
    } catch (e) {
      console.error(`zinc:map: ${key}: ${e}`);
      Engine.provide(key, '');
    }
    me._open--;
  }
}
