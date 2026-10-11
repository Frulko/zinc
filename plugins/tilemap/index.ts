// zinc:tilemap (ZN-443): the levels of the Tiled maps (.tmj) and LDtk projects (.ldtk) that the asset build imports (zinc.json rules
// `"as": "tilemap"`, docs/plugins/tilemap.md): their layers of cells, IntGrid values, objects and entities with their typed properties.
// Their tiles are frames of a zinc:sprite atlas, so the GL renderer draws a level in few batches; only the cells in view are drawn.
import { width, height } from 'zinc:gfx';
import { atlas, Atlas, Frame } from 'zinc:sprite';
import { exists, readText } from 'zinc:assets';

function unescape(s: string): string {   // the table's fields escape \, tab and line breaks
  if (s.indexOf('\\') < 0) return s;
  let o = '';
  for (let i = 0; i < s.length; i++) {
    const c = s.charAt(i);
    if (c !== '\\' || i + 1 >= s.length) { o += c; continue; }
    i++;
    const n = s.charAt(i);
    o += n === 't' ? '\t' : n === 'n' ? '\n' : n === 'r' ? '\r' : n;
  }
  return o;
}

function numbers(s: string): i32[] {   // comma-separated whole numbers: a layer's cells (split and parseInt beat a loop over char codes)
  const out: i32[] = [];
  if (s.length === 0) return out;
  for (const v of s.split(',')) out.push(parseInt(v));
  return out;
}

/** Custom properties: Tiled's properties, LDtk's fields. Types: string, int, float, bool, color, file, enum, object (Tiled), json (the
 *  value as JSON text: Tiled classes, LDtk arrays and points). */
export class Properties {
  names: string[] = [];
  types: string[] = [];
  values: string[] = [];

  add(name: string, type: string, value: string): void { this.names.push(name); this.types.push(type); this.values.push(value); }
  has(name: string): boolean { return this.names.indexOf(name) >= 0; }
  /** Its type, '' when there is no such property. */
  type(name: string): string { const i = this.names.indexOf(name); return i < 0 ? '' : this.types[i]; }
  string(name: string, def: string = ''): string { const i = this.names.indexOf(name); return i < 0 ? def : this.values[i]; }
  number(name: string, def: number = 0): number { const i = this.names.indexOf(name); return i < 0 || this.values[i].length === 0 ? def : parseFloat(this.values[i]); }
  bool(name: string, def: boolean = false): boolean { const i = this.names.indexOf(name); return i < 0 ? def : this.values[i] === 'true'; }
}

/** A Tiled object or an LDtk entity, in its layer's points. */
export class MapObject {
  /** Tiled's number, LDtk's iid. */
  id: string;
  name: string;
  /** Tiled's class, LDtk's entity identifier. */
  type: string;
  /** 'rect', 'ellipse', 'point', 'polygon', 'polyline', 'text' or 'tile' (Tiled's tile objects: their tile's bottom left corner is x, y). */
  shape: string;
  x: number; y: number; width: number; height: number;
  /** Degrees, clockwise. */
  rotation: number;
  /** A tile object's tile, as a cell holds it (index * 4 + flips); 0 for the others. */
  tile: i32;
  /** A polygon's or polyline's points [x0, y0, x1, y1...], from x, y. */
  points: number[];
  props: Properties = new Properties();

  constructor(id: string, name: string, type: string, shape: string, x: number, y: number, width: number, height: number, rotation: number,
              tile: i32, points: number[]) {
    this.id = id; this.name = name; this.type = type; this.shape = shape; this.x = x; this.y = y; this.width = width; this.height = height;
    this.rotation = rotation; this.tile = tile; this.points = points;
  }
}

/** A layer of a level: cells (a tile layer, an LDtk IntGrid or auto-layer), objects (a Tiled object layer, LDtk entities), or both empty. */
export class Layer {
  name: string;
  cols: i32; rows: i32;
  cellWidth: number; cellHeight: number;
  /** Where its cell (0, 0) is in the level: the layer's offset. */
  x: number; y: number;
  opacity: number;
  visible: boolean;
  /** How much it moves with the camera (Tiled's parallax factor): 1 moves with the level, 0 stays on the screen. */
  parallaxX: number; parallaxY: number;
  /** 0xRRGGBB, multiplies the tiles' colour (Tiled's tint). */
  tint: u32;
  /** Row by row, index * 4 + flips (1 mirrored in x, 2 in y); 0 is an empty cell. */
  cells: i32[] = [];
  /** LDtk IntGrid values, row by row (collisions, regions). */
  values: i32[] = [];
  objects: MapObject[] = [];
  props: Properties = new Properties();

  constructor(name: string, cols: i32, rows: i32, cellWidth: number, cellHeight: number, x: number, y: number, opacity: number, visible: boolean,
              parallaxX: number, parallaxY: number, tint: u32) {
    this.name = name; this.cols = cols; this.rows = rows; this.cellWidth = cellWidth; this.cellHeight = cellHeight; this.x = x; this.y = y;
    this.opacity = opacity; this.visible = visible; this.parallaxX = parallaxX; this.parallaxY = parallaxY; this.tint = tint;
  }

  /** The column and the row of a point of the level (outside the layer: below 0 or from cols, rows). */
  col(x: number): i32 { return Math.floor((x - this.x) / this.cellWidth); }
  row(y: number): i32 { return Math.floor((y - this.y) / this.cellHeight); }
  /** The index of the tile of a cell (its flips left out), 0 for an empty cell or outside the layer. */
  tile(col: i32, row: i32): i32 {
    if (col < 0 || row < 0 || col >= this.cols || row >= this.rows || this.cells.length === 0) return 0;
    return this.cells[row * this.cols + col] >> 2;
  }
  /** The IntGrid value of a cell, 0 outside the layer or without values. */
  value(col: i32, row: i32): i32 {
    if (col < 0 || row < 0 || col >= this.cols || row >= this.rows || this.values.length === 0) return 0;
    return this.values[row * this.cols + col];
  }
}

/** A level: a Tiled map, or one level of an LDtk project. */
export class Level {
  map: TileMap;
  name: string;
  /** Its place in the LDtk world (0, 0 for Tiled) and its size, points. */
  x: number; y: number; width: number; height: number;
  /** The background colour, 0xRRGGBB, -1 when it has none. */
  background: i32;
  /** Bottom first: the order they are drawn in. An LDtk cell with several tiles adds layers of the same name, one per tile. */
  layers: Layer[] = [];
  objects: MapObject[] = [];
  props: Properties = new Properties();

  constructor(map: TileMap, name: string, x: number, y: number, width: number, height: number, background: i32) {
    this.map = map; this.name = name; this.x = x; this.y = y; this.width = width; this.height = height; this.background = background;
  }

  /** The (first) layer of that name. */
  layer(name: string): Layer {
    for (const l of this.layers) if (l.name === name) return l;
    throw new Error(`zinc:tilemap: the level ${this.name} has no layer ${name}`);
  }

  /** Draws its visible layers: the level's point (camX, camY) at the screen's (0, 0) (zinc:gfx translate moves it), each layer moved by its
   *  parallax, only the cells whose tiles reach the view of viewW x viewH points (0: the screen's size). alpha 0..255 and flags (ImageFlag:
   *  Nearest for pixel art at fractional positions) apply to every tile. Returns the number of tiles drawn. */
  draw(camX: number = 0, camY: number = 0, viewW: number = 0, viewH: number = 0, alpha: i32 = 255, flags: i32 = 0): i32 {
    let n = 0;
    for (const l of this.layers) if (l.visible) n += this.drawLayer(l, camX, camY, viewW, viewH, alpha, flags);
    return n;
  }

  drawLayer(l: Layer, camX: number = 0, camY: number = 0, viewW: number = 0, viewH: number = 0, alpha: i32 = 255, flags: i32 = 0): i32 {
    const a = Math.round(l.opacity * alpha);
    if (l.cells.length === 0 || a <= 0) return 0;
    const w = viewW > 0 ? viewW : width(), h = viewH > 0 ? viewH : height(), m = this.map, reach = m.reach;
    const ox = l.x - camX * l.parallaxX, oy = l.y - camY * l.parallaxY;   // where the layer's cell (0, 0) is on the screen
    const c0 = Math.max(0, Math.floor((-ox - reach) / l.cellWidth)), c1 = Math.min(l.cols - 1, Math.floor((w - ox + reach) / l.cellWidth));
    const r0 = Math.max(0, Math.floor((-oy - reach) / l.cellHeight)), r1 = Math.min(l.rows - 1, Math.floor((h - oy + reach) / l.cellHeight));
    let n = 0;
    for (let r = r0; r <= r1; r++)
      for (let c = c0; c <= c1; c++) {
        const v = l.cells[r * l.cols + c];
        if (v === 0) continue;
        const k = (v >> 2) - 1;
        m.frames[k].draw(ox + c * l.cellWidth + m.dx[k], oy + r * l.cellHeight + m.dy[k], 0, 0, a, flags | (v & 3), 0, l.tint);
        n++;
      }
    return n;
  }
}

/** An imported map: its levels (one for Tiled) and the tiles they use, frames of its atlas. */
export class TileMap {
  name: string;
  atlas: Atlas = new Atlas('');
  /** Tile i (a cell's index i + 1): its frame, and where it is drawn from the top left corner of its cell. */
  frames: Frame[] = [];
  dx: number[] = [];
  dy: number[] = [];
  levels: Level[] = [];
  /** How far a tile reaches out of its cell, points: the cells drawn around the view. */
  reach: number = 0;

  constructor(name: string) { this.name = name; }

  /** The level of that name, the first one for ''. */
  level(name: string = ''): Level {
    for (const lv of this.levels) if (name === '' || lv.name === name) return lv;
    throw new Error(`zinc:tilemap: ${this.name} has no level ${name}`);
  }

  read(table: string): void {
    const lines = readText(table).split('\n');
    if (lines[0] !== 'zinc-tilemap\t1') throw new Error(`zinc:tilemap: ${table} is not a tile map table this module reads`);
    let props = new Properties();   // where the next prop row goes: the last level, layer or object
    for (let i = 1; i < lines.length; i++) {
      const c = lines[i].split('\t');
      const kind = c[0];
      if (kind === 'tile') {
        const f = this.atlas.frame(unescape(c[1])), dx = parseFloat(c[2]), dy = parseFloat(c[3]);
        this.frames.push(f); this.dx.push(dx); this.dy.push(dy);
        this.reach = Math.max(this.reach, Math.max(Math.abs(dx) + f.width, Math.abs(dy) + f.height));
      } else if (kind === 'level') {
        const lv = new Level(this, unescape(c[1]), parseFloat(c[2]), parseFloat(c[3]), parseFloat(c[4]), parseFloat(c[5]), parseInt(c[6]));
        this.levels.push(lv);
        props = lv.props;
      } else if (kind === 'layer') {
        const l = new Layer(unescape(c[1]), parseInt(c[2]), parseInt(c[3]), parseFloat(c[4]), parseFloat(c[5]), parseFloat(c[6]), parseFloat(c[7]),
                            parseFloat(c[8]), c[9] === '1', parseFloat(c[10]), parseFloat(c[11]), parseInt(c[12]));
        this.levels[this.levels.length - 1].layers.push(l);
        props = l.props;
      } else if (kind === 'cells' || kind === 'ints') {
        const lv = this.levels[this.levels.length - 1], l = lv.layers[lv.layers.length - 1];
        if (kind === 'cells') l.cells = numbers(c[1]);
        else l.values = numbers(c[1]);
      } else if (kind === 'object') {
        const pts: number[] = [];
        if (c[11].length > 0) for (const p of c[11].split(',')) pts.push(parseFloat(p));
        const o = new MapObject(unescape(c[1]), unescape(c[2]), unescape(c[3]), c[4], parseFloat(c[5]), parseFloat(c[6]), parseFloat(c[7]), parseFloat(c[8]),
                                parseFloat(c[9]), parseInt(c[10]), pts);
        const lv = this.levels[this.levels.length - 1];
        lv.layers[lv.layers.length - 1].objects.push(o);
        lv.objects.push(o);
        props = o.props;
      } else if (kind === 'prop') props.add(unescape(c[1]), c[2], unescape(c[3]));
      else if (kind === 'atlas') this.atlas = atlasNamed(unescape(c[1]));
    }
  }
}

const atlases: Atlas[] = [];   // one per name, whichever maps share it
function atlasNamed(name: string): Atlas {
  for (const a of atlases) if (a.name === name) return a;
  const a = atlas(name);
  atlases.push(a);
  return a;
}

/** The map the asset build imported from `name` (a .tmj or .ldtk file of the assets, under a rule `"as": "tilemap"`). */
export function load(name: string): TileMap {
  const table = name + '.tilemap';
  if (!exists(table)) throw new Error(`zinc:tilemap: ${name} was not imported: give it a zinc.json rule { "match": "${name}", "as": "tilemap" }`);
  const m = new TileMap(name);
  m.read(table);
  return m;
}
