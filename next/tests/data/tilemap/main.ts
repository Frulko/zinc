// The tilemap test (tests/t1/tilemap.sh, ZN-443): prints the levels, layers, objects and properties of a Tiled map and an LDtk project, then
// draws the Tiled map at (0, 0), the LDtk level Level_1 at (272, 0), and a 100 x 80 view of the Tiled map from its point (37, 51) at (540, 0),
// clipped: check.py compares each with the editors' renders in ref/. `drawn` lines: the tiles each draw call drew (the view culls).
import { onFrame, clear, clip, unclip, translate } from 'zinc:gfx';
import { load, Level, Layer, MapObject } from 'zinc:tilemap';

const t0 = Date.now();
const tiled = load('tiled/temple.tmj'), ldtk = load('levelBgs.ldtk');
console.log(`time load ${Date.now() - t0} ms`);

function props(indent: string, names: string[], types: string[], values: string[]): void {
  for (let i = 0; i < names.length; i++) console.log(`${indent}prop ${names[i]} ${types[i]} ${JSON.stringify(values[i])}`);
}
function show(lv: Level): void {
  console.log(`level ${lv.name} ${lv.x},${lv.y} ${lv.width}x${lv.height} background ${lv.background}`);
  props('  ', lv.props.names, lv.props.types, lv.props.values);
  for (const l of lv.layers) {
    let tiles = 0, set = 0;
    for (const v of l.cells) if (v !== 0) tiles++;
    for (const v of l.values) if (v !== 0) set++;
    console.log(`  layer ${l.name} ${l.cols}x${l.rows} cell ${l.cellWidth}x${l.cellHeight} at ${l.x},${l.y} opacity ${l.opacity} ${l.visible ? 'visible' : 'hidden'} parallax ${l.parallaxX},${l.parallaxY} tint ${l.tint} tiles ${tiles} values ${set}/${l.values.length} objects ${l.objects.length}`);
    props('    ', l.props.names, l.props.types, l.props.values);
    for (const o of l.objects) {
      console.log(`    object ${o.id} ${o.name} ${o.type} ${o.shape} at ${o.x},${o.y} ${o.width}x${o.height} rotation ${o.rotation} tile ${o.tile} points ${o.points.join(',')}`);
      props('      ', o.props.names, o.props.types, o.props.values);
    }
  }
}
console.log(`map ${tiled.name}: ${tiled.levels.length} level(s), ${tiled.frames.length} tiles, atlas ${tiled.atlas.name}`);
show(tiled.level());
let names = '';
for (const lv of ldtk.levels) names += ' ' + lv.name;
console.log(`map ${ldtk.name}: ${ldtk.levels.length} level(s):${names}, ${ldtk.frames.length} tiles, atlas ${ldtk.atlas.name}`);
const level1 = ldtk.level('Level_1');
show(level1);

// typed access and collisions
const player: MapObject = tiled.level().objects[0];
console.log(`player hp ${player.props.number('hp') + 1} speed ${player.props.number('speed') * 2} flying ${player.props.bool('flying')} title ${JSON.stringify(player.props.string('title'))} type of tint ${player.props.type('tint')}`);
const walls: Layer = level1.layer('Collisions');
let row = '';
for (let c = 0; c < walls.cols; c++) row += walls.value(c, walls.row(100));
console.log(`Level_1 Collisions row at y 100: ${row}; tile at (150, 100): ${walls.tile(walls.col(150), walls.row(100))}; outside: ${walls.value(-1, 0)} ${walls.tile(99, 0)}`);

let first = true;
onFrame((dt: number) => {
  clear(0x202020);
  const a = tiled.level().draw(0, 0, 260, 275);
  translate(272, 0);
  const b = level1.draw(0, 0, 256, 272);
  translate(0, 0);
  clip(540, 0, 100, 80);
  translate(540, 0);
  const c = tiled.level().draw(37, 51, 100, 80);
  translate(0, 0);
  unclip();
  if (first) console.log(`drawn ${a} tiles of the Tiled map, ${b} of Level_1, ${c} in the view`);
  first = false;
});
