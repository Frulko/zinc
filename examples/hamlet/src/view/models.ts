import { W, H, pix, zb, setView, Color, CachedModel, rgb, beginModel, captureModel, touchModelBuffer, box, capsule, sphere, plot, rampOf, hash, shadowMask, pine, Atlas, AtlasAxes, AtlasDef, AtlasEntry, bakeAtlas, hashNumbers } from '../pixel';
import { ZOOM_SCALES } from './camera';
import { settings } from '../settings';
import { ROCK_VARIANTS } from '../constants';
import { biomes, needleColor, ensureBiomes } from './seasons';
import { STONE, WOOD_HONEY, WOOD_BROWN, BARK, TERRACOTTA } from '../palettes';

// Every static object is lit and rasterised once into a CachedModel (same projection, light and ramps as the Pixel Plays games),
// then stamped on the scene wherever it stands. Add an object: write a function, push it in buildModels, give it an index.
export const MODEL_HOUSE = 0;
export const MODEL_SAWMILL = 1;
export const MODEL_LODGE = 2;
export const MODEL_FISHERY = 3;
/** The model id of each building type, in the order of assets/economy.json (a building's model sits at its own index). */
export const MODEL_IDS: string[] = ['house', 'sawmill', 'lodge', 'fishery', 'storehouse', 'lumberhut', 'smokehouse', 'farm', 'mill', 'bakery', 'market', 'tannery', 'well', 'quarry', 'claypit', 'mine', 'forge', 'forager', 'apiary', 'chandlery', 'meadery', 'tavern', 'firehouse', 'works', 'watchpost', 'ruin'];
export const MODEL_GATE = MODEL_IDS.length;
export const MODEL_TREE = MODEL_GATE + 1;            // 4 variants
export const MODEL_ROCK = MODEL_TREE + 4;            // 2 variants
export const MODEL_HOUSE_UP = MODEL_ROCK + ROCK_VARIANTS;         // the house at level 2 and 3 (level 1 is MODEL_HOUSE)
/** The model of a building on the map: houses change with their level. */
export function modelOf(type: number, level: number): number { return type === 0 && level > 0 ? MODEL_HOUSE_UP + Math.min(level, 2) - 1 : MODEL_HOUSE + type; }
export const TREE_HEIGHT: number[] = [2.8, 3.3, 3.8, 3.2];
/** The models of the zoom level in use. Each level has its own set, baked once (the stamp depends on pixels per unit). */
export const models: CachedModel[] = [];
const treeAtlases = new Map<number, Atlas>();                 // the trees of each (zoom level, season)
let lastLevel = 0, lastScale = 10, lastReduce = 0;
const levelAtlases: (Atlas | null)[] = ZOOM_SCALES.map((_s: number): Atlas | null => null);

/** The season the tree models are drawn in (0 spring .. 3 winter): summer is the art's own, the other three are baked by useTreeSeason. */
let treeSeason = 1;
const flat = (c: Color): ((z: number) => Color) => (): Color => c;

/** A gable roof: ridge along y, slopes facing -x and +x, shingles in staggered rows. */
function gableRoof(x0: number, x1: number, y0: number, y1: number, base: number, rise: number, color: Color, seed: number): void {
  const tiles = rampOf(color), half = (x1 - x0) / 2, mid = (x0 + x1) / 2;
  for (let x = x0; x <= x1; x += .04) {
    const z = base + rise * (1 - Math.abs(x - mid) / half);
    for (let y = y0; y <= y1; y += .04) {
      const row = Math.floor((y - y0) * 6), tile = Math.floor(x * 5 + (row % 2) * .5) + seed;
      plot(x, y, z, tiles[x < mid ? 1 : (hash(tile, row) > .6 ? 4 : 3)]);
    }
  }
}
/** The triangular gable wall under that roof, on the +y face. */
function gableWall(x0: number, x1: number, y: number, base: number, rise: number, roofHalf: number, color: Color): void {
  const wall = rampOf(color), mid = (x0 + x1) / 2;
  for (let x = x0; x <= x1; x += .04) {
    const top = base + rise * (1 - Math.abs(x - mid) / roofHalf);
    for (let z = base; z <= top - .04; z += .04) plot(x, y, z, wall[2 + (hash(Math.floor(x * 6), Math.floor(z * 6)) > .8 ? 1 : 0)]);
  }
}

function house(): void {
  box(-.72, -.72, 0, .72, .72, 1.5, STONE);
  gableRoof(-.92, .92, -.86, .86, 1.45, 1.05, TERRACOTTA, 0);
  gableWall(-.72, .72, .72, 1.5, 1.05, .92, STONE);
  box(-.17, .71, 0, .17, .76, .95, [112, 84, 56]);                      // door
  box(.71, -.34, .6, .76, .12, 1.12, [70, 96, 92]);                    // window
  box(.7, -.38, .55, .8, .16, .6, [148, 124, 94]);                     // sill
  box(.32, -.42, 1.7, .62, -.14, 2.55, [186, 170, 140]);               // chimney
}

/** The house at level 2: a taller stone house with an upper row of windows, a porch and a dormer. */
function house2(): void {
  box(-.74, -.74, 0, .74, .74, 2.05, STONE);
  box(-.74, -.74, 1.0, .74, .74, 1.07, [176, 150, 112]);                    // floor band
  gableRoof(-.94, .94, -.88, .88, 2.0, 1.1, TERRACOTTA, 0);
  gableWall(-.74, .74, .74, 2.05, 1.1, .94, STONE);
  box(-.2, .73, 0, .2, .79, .98, [112, 84, 56]);                           // door
  box(-.5, .73, .1, .5, 1.0, .2, [148, 124, 94]);                           // porch step
  box(.72, -.4, .5, .78, .1, 1.0, [70, 96, 92]); box(.72, -.4, 1.35, .78, .1, 1.85, [70, 96, 92]);   // windows, ground and upper
  box(-.5, .73, 1.3, -.1, .78, 1.8, [70, 96, 92]);
  box(.34, -.45, 2.4, .64, -.15, 3.3, [186, 170, 140]);                      // chimney
}
/** The house at level 3: a plastered manor with a slate roof, a balcony, two chimneys and a flower box. */
function house3(): void {
  box(-.78, -.78, 0, .78, .78, 2.1, [226, 208, 170]);
  box(-.8, -.8, 0, .8, .8, .2, [150, 140, 126]);                            // stone plinth
  gableRoof(-1.0, 1.0, -.92, .92, 2.05, 1.3, [96, 104, 118], 7);
  gableWall(-.78, .78, .78, 2.1, 1.3, 1.0, [226, 208, 170]);
  box(-.22, .77, .2, .22, .83, 1.05, [96, 62, 44]);                         // door
  box(-.5, .77, 1.4, .5, 1.05, 1.5, WOOD_BROWN); box(-.5, 1.0, 1.5, .5, 1.05, 1.9, [150, 118, 82]);   // balcony
  for (let k = 0; k < 5; k++) sphere(-.4 + k * .2, 1.02, 1.58, .07, k % 2 === 0 ? [214, 96, 96] : [236, 200, 90], 'rough');   // flower box
  box(.76, -.5, .6, .82, .2, 1.2, [70, 96, 92]); box(.76, -.5, 1.4, .82, .2, 1.9, [70, 96, 92]);
  box(.4, -.55, 2.5, .7, -.25, 3.5, [196, 170, 130]); box(-.6, -.5, 2.5, -.3, -.2, 3.4, [196, 170, 130]);
}

function sawmill(): void {
  box(-.95, -.85, 0, .95, .85, .16, WOOD_BROWN);                       // deck
  for (const x of [-.85, .8]) for (const y of [-.75, .7]) box(x, y, .16, x + .12, y + .12, 1.9, WOOD_BROWN);
  gableRoof(-1, 1, -.95, .95, 1.9, .55, [112, 100, 80], 3);
  box(-.2, -.5, .16, .5, .5, .52, WOOD_HONEY);                         // bench
  capsule([-.1, -.4, .66], [-.1, .45, .66], .15, .15, flat([150, 118, 80]), 'rough');
  for (let a = 0; a < Math.PI * 2; a += .06) {                         // saw blade, edge-on to the camera's right side
    const r = .38 + (Math.floor(a * 9) % 2) * .05;
    plot(.55, Math.cos(a) * r, .95 + Math.sin(a) * r, a > 3.4 ? rgb(182, 188, 184) : rgb(150, 156, 154));
  }
  for (let k = 0; k < 3; k++) capsule([-.8, -.55 + k * .22, .36], [-.8, .1 + k * .22, .36], .15, .15, flat(BARK), 'rough');
  for (let layer = 0; layer < 3; layer++) box(.15, .5 - layer * .02, .16 + layer * .09, .85, .8, .25 + layer * .09, [214, 180, 120], layer);
}

function lodge(): void {
  box(-.68, -.68, 0, .68, .68, 1.5, [104, 76, 52]);
  for (let z = .1; z < 1.5; z += .24) {                                // stacked logs, visible on the two faces the camera sees
    capsule([-.72, .7, z], [.72, .7, z], .13, .13, flat([132, 96, 62]), 'rough');
    capsule([.7, -.72, z], [.7, .72, z], .13, .13, flat([118, 86, 56]), 'rough');
  }
  gableRoof(-.92, .92, -.86, .86, 1.5, .95, [92, 108, 70], 7);
  gableWall(-.7, .7, .7, 1.5, .95, .92, [104, 76, 52]);
  box(-.2, .72, 0, .2, .78, .98, [70, 52, 38]);                        // door
  for (const side of [-1, 1]) {                                        // antlers above the door
    capsule([0, .8, 1.15], [side * .3, .8, 1.5], .03, .02, flat([226, 212, 176]), 'solid');
    capsule([side * .17, .8, 1.32], [side * .35, .8, 1.28], .02, .015, flat([226, 212, 176]), 'solid');
  }
  box(.74, -.5, .7, .8, .1, 1.3, [200, 160, 110]);                     // hide drying on the wall
  box(.74, .2, .6, .8, .55, 1.15, [168, 126, 88]);
  box(.3, -.46, 1.7, .56, -.2, 2.4, [150, 140, 120]);                  // chimney
}

/** A fishing hut: planked cabin on a small landing, a net drying on a frame, a barrel and a catch basket. */
function fishery(): void {
  box(-.9, -.8, 0, .9, .8, .14, WOOD_BROWN);                                // landing
  box(-.6, -.55, .14, .6, .55, 1.3, [150, 126, 92]);                        // cabin
  for (let x = -.55; x < .6; x += .2) box(x, .55, .14, x + .02, .56, 1.3, [112, 90, 62]);   // plank seams on the +y face
  gableRoof(-.78, .78, -.7, .7, 1.25, .8, [104, 124, 128], 11);
  gableWall(-.6, .6, .55, 1.3, .8, .78, [150, 126, 92]);
  box(-.15, .54, .14, .15, .6, .9, [70, 52, 38]);                           // door
  box(.59, -.3, .6, .64, .2, 1.0, [70, 96, 92]);                            // window
  box(.7, -.78, .14, .78, -.7, 1.5, WOOD_BROWN); box(.7, .5, .14, .78, .58, 1.5, WOOD_BROWN);   // net frame posts
  for (let k = 0; k < 24; k++) {                                            // the net: a loose mesh of pale pixels between the posts
    const y = -.7 + (k % 12) * .105, z = 1.45 - Math.floor(k / 12) * .35 - Math.sin((k % 12) / 12 * Math.PI) * .12;
    for (let j = 0; j < 7; j++) plot(.74, y, z - j * .1, rgb(206, 196, 164));
  }
  capsule([-.75, .55, .3], [-.75, .55, .8], .17, .17, flat([128, 92, 60]), 'rough');          // barrel
  sphere(-.75, .55, .82, .15, [96, 70, 48], 'rough');
  sphere(-.35, .72, .25, .16, [180, 150, 96], 'rough');                                       // basket
  sphere(-.3, .72, .36, .06, [176, 190, 184], 'solid');                                       // a silver fish on top
}

/** The storehouse: a long timber barn with a wide door, crates, barrels and sacks outside. */
function storehouse(): void {
  box(-1.0, -.7, 0, 1.0, .7, .12, WOOD_BROWN);                                 // plinth
  box(-.9, -.6, .12, .9, .6, 1.25, [150, 118, 82]);                            // walls
  for (let x = -.85; x < .9; x += .22) box(x, .6, .12, x + .03, .62, 1.25, [112, 86, 58]);   // plank seams on the +y face
  gableRoof(-1.05, 1.05, -.78, .78, 1.2, .8, [96, 78, 66], 5);
  gableWall(-.9, .9, .6, 1.25, .8, 1.05, [150, 118, 82]);
  box(-.34, .59, .12, .34, .66, 1.0, [76, 56, 40]);                            // wide door
  box(-.02, .66, .12, .02, .68, 1.0, [112, 86, 58]);
  box(.58, .62, .12, .88, .92, .42, [190, 148, 92]); box(.62, .66, .42, .84, .88, .62, [176, 136, 84]);   // crates
  capsule([-.7, .8, .14], [-.7, .8, .62], .17, .17, flat([128, 92, 60]), 'rough'); sphere(-.7, .8, .64, .15, [96, 70, 48], 'rough');   // barrel
  sphere(-.45, .85, .2, .2, [214, 200, 164], 'rough'); sphere(-.2, .9, .16, .17, [200, 186, 150], 'rough');   // sacks
  box(.9, -.25, .12, .98, .25, .9, WOOD_BROWN);                                // loading beam on the side
}

/** A woodcutter's cabin: a small log cabin with a moss roof, a chopping block with an axe, a stack of logs and a pile of cut planks. */
function lumberhut(): void {
  box(-.62, -.55, 0, .62, .55, 1.1, [112, 82, 56]);
  for (let z = .12; z < 1.1; z += .22) {                                   // log walls, ends showing on the two faces the camera sees
    capsule([-.66, .58, z], [.66, .58, z], .12, .12, flat([138, 100, 64]), 'rough');
    capsule([.64, -.58, z], [.64, .58, z], .12, .12, flat([124, 90, 58]), 'rough');
  }
  gableRoof(-.82, .82, -.72, .72, 1.1, .7, [84, 112, 66], 9);
  gableWall(-.64, .64, .58, 1.1, .7, .82, [112, 82, 56]);
  box(-.18, .58, 0, .18, .64, .85, [66, 48, 36]);                          // door
  box(.28, -.32, 1.6, .5, -.1, 2.2, [150, 140, 120]);                      // chimney
  capsule([-.95, .2, 0], [-.95, .2, .38], .2, .2, flat([170, 130, 88]), 'rough');          // chopping block
  capsule([-.95, .2, .4], [-.95 + .02, .2 + .3, .85], .03, .03, flat(BARK), 'solid');      // axe in it: handle and head
  box(-.99, .42, .72, -.9, .48, .9, [176, 182, 180]);
  for (let k = 0; k < 6; k++) capsule([.75 + (k % 3) * .2, .72, .14 + Math.floor(k / 3) * .24], [.75 + (k % 3) * .2, 1.2, .14 + Math.floor(k / 3) * .24], .1, .1, flat([142, 104, 68]), 'rough');   // logs piled at the side
  for (let layer = 0; layer < 3; layer++) box(-.6, .75 - layer * .02, .02 + layer * .09, .15, 1.05, .1 + layer * .09, [214, 180, 120], layer);   // cut planks
}

/** A smokehouse: a squat stone shed with a tall chimney, meat hanging on a rack beside it and a stack of fuel logs. */
function smokehouse(): void {
  box(-.7, -.6, 0, .7, .6, 1.2, [158, 150, 134]);
  for (let z = .15; z < 1.2; z += .3) for (let x = -.65; x < .7; x += .35) box(x, .6, z, x + .3, .64, z + .26, hash(Math.floor(x * 9), Math.floor(z * 9)) > .5 ? [172, 164, 146] : [140, 132, 118]);   // stone courses
  gableRoof(-.86, .86, -.74, .74, 1.2, .55, [92, 84, 78], 13);
  gableWall(-.7, .7, .6, 1.2, .55, .86, [158, 150, 134]);
  box(-.2, .6, 0, .2, .66, .85, [60, 46, 38]);                              // low door
  box(.3, -.5, 1.4, .62, -.18, 2.7, [120, 112, 104]);                       // tall chimney, blackened
  box(.28, -.52, 2.7, .64, -.16, 2.82, [88, 82, 76]);
  for (const x of [.9, 1.5]) box(x, -.3, 0, x + .08, -.22, 1.3, WOOD_BROWN);   // the rack: two posts, a beam, hanging meat
  box(.88, -.32, 1.25, 1.6, -.2, 1.35, WOOD_HONEY);
  for (let k = 0; k < 4; k++) capsule([1.0 + k * .16, -.26, 1.22], [1.0 + k * .16, -.26, .72], .08, .06, flat([158, 84, 64]), 'rough');
  for (let k = 0; k < 6; k++) capsule([-.5 + (k % 3) * .22, .85, .14 + Math.floor(k / 3) * .22], [-.5 + (k % 3) * .22, 1.3, .14 + Math.floor(k / 3) * .22], .09, .09, flat([142, 104, 68]), 'rough');   // fuel logs
}

/** A farm: a low timber barn with a hay loft and, beside it, a field of golden wheat in rows. */
function farm(): void {
  box(-.9, -.8, 0, -.1, .1, 1.0, [150, 118, 82]);
  gableRoof(-1.0, 0, -.9, .2, 1.0, .6, [150, 96, 70], 15);
  gableWall(-.9, -.1, .1, 1.0, .6, .5, [150, 118, 82]);
  box(-.65, .09, 0, -.35, .14, .75, [76, 56, 40]);                         // door
  for (let row = 0; row < 5; row++) for (let k = 0; k < 14; k++) {          // wheat: rows of thin golden stalks with a heavier head
    const x = .15 + row * .2, y = -.85 + k * .12;
    capsule([x, y, 0], [x + .02, y, .45 + hash(row, k) * .12], .025, .02, flat([214, 190, 96]), 'solid');
    sphere(x + .02, y, .5 + hash(row, k) * .12, .045, [226, 200, 104], 'solid');
  }
  sphere(-.5, -.95, .2, .24, [220, 196, 120], 'rough');                      // a hay bale
}
/** A windmill: a round stone tower on a plinth with a cap and four sails facing the camera. */
function mill(): void {
  box(-.55, -.55, 0, .55, .55, .18, [150, 142, 126]);
  capsule([0, 0, .15], [0, 0, 1.7], .5, .36, flat([196, 188, 168]), 'rough');
  capsule([0, 0, 1.65], [0, 0, 2.1], .4, .08, flat([118, 82, 62]), 'rough');
  box(-.14, .46, 0, .14, .56, .7, [66, 48, 36]);                           // door
  for (let a = 0; a < 4; a++) {                                            // sails: four arms from the hub on the +y face
    const ang = a * Math.PI / 2 + .35, hy = .5, hz = 1.55, dx = Math.cos(ang), dz = Math.sin(ang);
    capsule([0, hy, hz], [dx * 1.1, hy + .08, hz + dz * 1.1], .04, .04, flat(WOOD_BROWN), 'solid');
    for (let k = 1; k <= 5; k++) box(dx * k * .2 - .09, hy + .05, hz + dz * k * .2 - .09, dx * k * .2 + .09, hy + .09, hz + dz * k * .2 + .09, [232, 222, 196], k);
  }
  sphere(0, .5, 1.55, .09, [96, 70, 48], 'solid');
  capsule([.55, -.2, .15], [.55, .35, .15], .17, .17, flat([226, 220, 204]), 'rough');   // flour sacks at the foot
}
/** A bakery: a warm plaster house with a big brick oven chimney and loaves cooling on a bench. */
function bakery(): void {
  box(-.7, -.65, 0, .7, .65, 1.35, [214, 176, 128]);
  gableRoof(-.9, .9, -.8, .8, 1.3, .9, [150, 84, 62], 17);
  gableWall(-.7, .7, .65, 1.35, .9, .9, [214, 176, 128]);
  box(-.18, .64, 0, .18, .7, .9, [96, 62, 44]);                            // door
  box(.71, -.4, .5, .78, .1, 1.1, [70, 96, 92]);                           // window
  box(.3, -.55, 1.3, .66, -.2, 2.6, [176, 96, 72]);                        // brick chimney
  box(.9, .1, .1, 1.3, .5, .55, WOOD_HONEY);                               // bench with loaves
  for (let k = 0; k < 4; k++) capsule([1.0 + (k % 2) * .18, .2 + Math.floor(k / 2) * .16, .62], [1.0 + (k % 2) * .18, .3 + Math.floor(k / 2) * .16, .62], .07, .07, flat([196, 140, 82]), 'rough');
}

/** A market stall: a counter under a striped awning on four posts, with crates and baskets of goods. */
function market(): void {
  box(-.8, -.45, 0, .8, .45, .55, WOOD_HONEY);                                                  // counter
  for (const x of [-.85, .8]) for (const y of [-.5, .4]) box(x, y, 0, x + .08, y + .1, 1.75, WOOD_BROWN);   // posts
  for (let k = 0; k < 8; k++) box(-.95 + k * .24, -.6, 1.7 - k * .02, -.95 + (k + 1) * .24, .6, 1.78 - k * .02, k % 2 === 0 ? [186, 74, 64] : [236, 226, 200]);   // striped awning
  for (let k = 0; k < 5; k++) sphere(-.55 + k * .26, 0, .66, .12, k % 2 === 0 ? [204, 84, 62] : [220, 176, 72], 'rough');   // goods on the counter
  box(.9, .1, 0, 1.3, .5, .4, [190, 148, 92]); sphere(1.1, .3, .5, .16, [136, 170, 84], 'rough');   // crate of greens
  capsule([-1.1, .3, 0], [-1.1, .3, .45], .16, .16, flat([128, 92, 60]), 'rough');                // barrel
}

/** A tannery: an open timber shed with hides stretched on frames, a tanning vat and a pile of finished leather. */
function tannery(): void {
  box(-.8, -.55, 0, .3, .55, 1.15, [138, 106, 72]);
  gableRoof(-.95, .45, -.7, .7, 1.1, .6, [102, 84, 66], 19);
  gableWall(-.8, .3, .55, 1.15, .6, .7, [138, 106, 72]);
  box(-.55, .54, 0, -.05, .6, .85, [66, 48, 36]);                           // wide door
  for (const y of [-.45, 0, .45]) { box(.5, y - .02, 0, .56, y + .02, 1.1, WOOD_BROWN); box(.9, y - .02, 0, .96, y + .02, 1.1, WOOD_BROWN); box(.5, y - .03, 1.02, .96, y + .03, 1.1, WOOD_BROWN); box(.54, y - .01, .15, .92, y + .01, .98, [196, 150, 104]); }   // hide frames
  capsule([-.1, .85, 0], [-.1, .85, .5], .3, .3, flat([112, 82, 56]), 'rough'); sphere(-.1, .85, .5, .26, [74, 92, 70], 'solid');   // vat with its brew
  for (let k = 0; k < 3; k++) box(-.7, .75 + k * .06, .04 + k * .09, -.3, 1.15 - k * .04, .12 + k * .09, [150, 104, 64], k);   // leather
}
/** A well: a stone ring with a gabled roof on two posts, a crank and a bucket. */
function well(): void {
  capsule([0, 0, 0], [0, 0, .62], .5, .46, flat([180, 172, 154]), 'rough');
  capsule([0, 0, .6], [0, 0, .66], .36, .36, flat([60, 112, 120]), 'solid');                // the water
  for (const y of [-.5, .42]) box(-.06, y, .5, .06, y + .08, 1.7, WOOD_BROWN);               // posts
  gableRoof(-.5, .5, -.62, .62, 1.65, .45, [150, 96, 70], 21);
  capsule([0, -.46, 1.35], [0, .46, 1.35], .04, .04, flat(WOOD_HONEY), 'solid');             // crank beam
  capsule([0, .1, 1.3], [0, .1, .9], .015, .015, flat([96, 76, 58]), 'solid'); capsule([0, .1, .9], [0, .1, .75], .09, .08, flat([128, 92, 60]), 'rough');   // rope and bucket
}

/** A quarry: a small open shed, a pile of cut blocks and an iron-bound crane over a block being dressed. */
function quarry(): void {
  box(-.8, -.5, 0, -.1, .5, .12, WOOD_BROWN);
  for (const y of [-.45, .4]) { box(-.8, y, .12, -.72, y + .08, 1.2, WOOD_BROWN); box(-.18, y, .12, -.1, y + .08, 1.2, WOOD_BROWN); }
  gableRoof(-.9, 0, -.6, .6, 1.15, .45, [112, 100, 86], 23);
  box(-.55, -.2, .12, -.25, .2, .5, WOOD_HONEY);                                   // work bench
  box(.2, -.55, 0, .8, .1, .5, [190, 184, 168]); box(.3, -.45, .5, .75, .0, .85, [200, 194, 176]); box(.25, .2, 0, .8, .7, .32, [172, 166, 150]);   // blocks
  box(.95, -.1, 0, 1.05, 0, 1.6, WOOD_BROWN); box(.5, -.1, 1.5, 1.05, 0, 1.6, WOOD_BROWN);                          // crane
  capsule([.55, -.05, 1.5], [.55, -.05, .95], .02, .02, flat([96, 76, 58]), 'solid');
  capsule([-.95, .5, .08], [-.95, .5, .5], .12, .12, flat([128, 92, 60]), 'rough');
}

/** A clay pit: a dug hollow with wet clay, a plank ramp, a barrow and a stack of drying bricks. */
function claypit(): void {
  box(-.8, -.6, 0, .1, .6, .1, [176, 108, 80]); sphere(-.35, 0, .1, .4, [150, 88, 66], 'rough');
  box(.1, -.3, 0, .9, .3, .12, WOOD_HONEY);                                           // ramp
  box(.45, .4, 0, .85, .85, .07, WOOD_BROWN); capsule([.65, .4, .25], [.65, .85, .25], .12, .12, flat([176, 108, 80]), 'rough');   // barrow
  for (let k = 0; k < 3; k++) box(-.7 + k * .3, -.95, 0, -.45 + k * .3, -.7, .22, [190, 112, 78]);   // bricks
}
/** A mine: a timber-framed tunnel mouth in a dark mound, with an ore cart on rails. */
function mine(): void {
  sphere(-.3, 0, .3, .95, [104, 100, 104], 'rough');
  for (const y of [-.38, .3]) box(.1, y, 0, .22, y + .08, .85, WOOD_BROWN);
  box(.1, -.38, .8, .22, .38, .92, WOOD_BROWN); box(.14, -.3, 0, .2, .3, .78, [30, 28, 32]);
  for (const y of [-.12, .12]) box(.2, y, 0, 1.1, y + .04, .05, [90, 90, 96]);
  box(.7, -.22, .06, 1.0, .22, .34, [118, 82, 56]); sphere(.85, 0, .38, .17, [190, 112, 60], 'solid');
}
/** A forge: a stone hearth with a chimney, a bellows, an anvil on a stump and a rack of tools. */
function forge(): void {
  box(-.7, -.5, 0, .1, .5, .9, [176, 170, 154]); box(-.45, -.15, .9, -.15, .15, 1.9, [150, 144, 130]); box(-.55, -.3, .5, -.1, .3, .6, [200, 90, 50]);
  gableRoof(-.8, .2, -.6, .6, .9, .2, [96, 84, 76], 29);
  box(.45, -.12, 0, .75, .12, .45, WOOD_BROWN); box(.38, -.2, .45, .82, .2, .58, [74, 76, 84]);
  box(.2, .55, .5, .22, .85, 1.0, WOOD_BROWN); box(.2, .55, .9, .22, .85, 1.0, [150, 156, 160]);
  capsule([-.6, .55, .15], [-.3, .8, .35], .1, .16, flat([118, 82, 56]), 'rough');
}
/** A forager's lean-to: two posts and a thatch, a basket of berries and a drying rack. */
function forager(): void {
  for (const y of [-.4, .4]) box(-.6, y, 0, -.5, y + .08, 1.1, WOOD_BROWN);
  gableRoof(-.75, -.1, -.55, .6, 1.05, .35, [196, 170, 100], 31);
  capsule([.3, -.2, .02], [.3, -.2, .3], .26, .32, flat(WOOD_HONEY), 'rough');
  for (const [x, y, z] of [[.22, -.25, .34], [.35, -.12, .36], [.3, -.3, .38]]) sphere(x, y, z, .07, [200, 52, 66], 'solid');
  capsule([.3, .45, .9], [.75, .45, .9], .03, .03, flat(WOOD_BROWN), 'solid');
  for (let k = 0; k < 3; k++) sphere(.4 + k * .15, .45, .8, .06, [150, 40, 70], 'solid');
}

/** An apiary: a low fence round a yard, three painted box hives with gabled lids on stands, a straw skep, and flowers by the gate. */
function apiary(): void {
  for (const [x, y, c] of [[-.5, -.35, [246, 238, 214]], [.05, -.4, [244, 196, 60]], [-.1, .3, [120, 176, 214]]] as [number, number, Color][]) {
    box(x - .1, y - .1, 0, x - .06, y - .06, .22, WOOD_BROWN); box(x + .06, y + .06, 0, x + .1, y + .1, .22, WOOD_BROWN);   // stand
    box(x - .22, y - .2, .22, x + .22, y + .2, .7, c); box(x - .24, y - .22, .7, x + .24, y + .22, .78, [226, 196, 150]);       // body, lid
    box(x - .12, y + .2, .26, x + .12, y + .24, .3, [40, 32, 28]);                                                           // the entrance slot
  }
  sphere(.62, .38, .2, .27, [226, 184, 84], 'rough'); sphere(.62, .38, .42, .2, [214, 170, 70], 'rough'); sphere(.62, .38, .58, .1, [196, 150, 60], 'rough');   // a skep
  for (const x of [-.95, -.5, 0, .5, .95]) { box(x - .03, -.95, 0, x + .03, -.9, .4, WOOD_BROWN); box(x - .03, .9, 0, x + .03, .95, .4, WOOD_BROWN); }
  box(-.97, -.95, .3, .97, -.91, .35, WOOD_HONEY); box(-.97, .91, .3, .97, .95, .35, WOOD_HONEY);
  for (const [x, y, c] of [[.4, -.7, [240, 120, 150]], [.6, -.62, [250, 244, 224]], [-.8, .65, [232, 196, 100]], [-.62, .72, [186, 126, 210]], [.85, .1, [240, 120, 150]]] as [number, number, Color][]) { capsule([x, y, 0], [x, y, .22], .02, .02, flat([84, 130, 70]), 'solid'); sphere(x, y, .26, .07, c, 'solid'); }
}
/** A chandlery: a small timbered workshop with a wax pot over a fire, candles hung to dry on a rack and a lit lantern by the door. */
function chandlery(): void {
  box(-.65, -.55, 0, .45, .55, 1.15, [214, 196, 160]); gableRoof(-.8, .6, -.7, .7, 1.1, .75, [150, 100, 70], 37);
  box(.43, -.2, .1, .5, .2, .95, WOOD_BROWN); box(.47, -.5, .62, .52, -.3, .86, [70, 96, 92]);
  box(.55, -.65, .5, .85, -.45, .58, WOOD_BROWN);                                    // rack
  for (let k = 0; k < 5; k++) capsule([.58 + k * .06, -.6, .5], [.58 + k * .06, -.6, .08 + (k % 2) * .06], .022, .022, flat([246, 238, 208]), 'solid');   // candles hanging
  capsule([.7, .35, 0], [.7, .35, .3], .22, .2, flat([60, 56, 56]), 'rough'); sphere(.7, .35, .32, .17, [240, 214, 128], 'solid');   // wax pot
  capsule([.95, -.1, 0], [.95, -.1, .5], .03, .03, flat(WOOD_BROWN), 'solid'); sphere(.95, -.1, .58, .09, [255, 214, 110], 'solid');   // lantern, lit
}
/** A meadery: a barn with big barrels, a copper kettle with a pipe, and a jug on a bench. */
function meadery(): void {
  box(-.7, -.6, 0, .35, .6, 1.2, [176, 138, 96]); gableRoof(-.85, .5, -.75, .75, 1.15, .6, [120, 96, 70], 41);
  box(.32, -.18, .1, .38, .18, 1.0, WOOD_BROWN);
  capsule([.7, -.4, .05], [.7, -.4, .62], .3, .3, flat([164, 112, 66]), 'rough'); capsule([.7, -.4, .45], [.7, -.4, .5], .31, .31, flat([90, 82, 76]), 'solid');   // barrel
  capsule([.75, .15, .05], [.75, .15, .5], .24, .24, flat([150, 100, 60]), 'rough');
  capsule([-.3, .8, 0], [-.3, .8, .4], .3, .3, flat([196, 118, 64]), 'rough'); sphere(-.3, .8, .5, .28, [214, 134, 76], 'rough');   // copper kettle
  capsule([-.1, .8, .55], [.3, .55, .62], .04, .04, flat([196, 118, 64]), 'solid');
  box(-.75, .62, 0, -.2, .86, .45, WOOD_HONEY); capsule([-.5, .74, .45], [-.5, .74, .62], .1, .08, flat([226, 164, 56]), 'solid');
}
/** A tavern: a stone ground floor with a timber upper storey, a gabled red roof, a hanging sign with a mug, a lit window and a barrel by the door. */
function tavern(): void {
  box(-.75, -.7, 0, .75, .7, .9, STONE); box(-.8, -.75, .9, .8, .75, 1.7, [186, 150, 106]); gableRoof(-.95, .95, -.9, .9, 1.65, .95, [150, 56, 52], 43);
  gableWall(-.8, .8, .75, 1.7, .95, .95, [186, 150, 106]);
  box(-.17, .69, 0, .17, .74, .72, [112, 84, 56]); box(.35, .69, .3, .6, .74, .62, [255, 214, 120]); box(-.62, .69, .3, -.37, .74, .62, [255, 214, 120]);   // door, lit windows
  box(.35, .75, 1.1, .6, .78, 1.45, [255, 214, 120]);
  capsule([.9, .5, 0], [.9, .5, .55], .2, .2, flat([158, 104, 56]), 'rough');                                  // barrel
  capsule([-1.0, .55, 1.0], [-1.0, .55, 1.9], .03, .03, flat(WOOD_BROWN), 'solid'); box(-1.0, .55, 1.8, -.7, .6, 1.9, WOOD_BROWN);
  box(-.95, .6, 1.25, -.75, .64, 1.5, [226, 180, 70]); capsule([-.85, .64, 1.28], [-.85, .64, 1.46], .05, .05, flat([250, 244, 224]), 'solid');   // the sign: a mug
  box(.32, -.46, 1.9, .62, -.2, 2.8, [186, 170, 140]);                                                         // chimney
}

/** The entrance of the hamlet: two posts, a beam and a banner over the road (which runs along x). */
function gate(): void {
  for (const y of [-.92, .78]) box(-.12, y, 0, .12, y + .16, 2.3, WOOD_BROWN);
  box(-.15, -.96, 2.1, .15, .96, 2.38, WOOD_HONEY);
  box(-.04, -.4, 1.45, .04, .4, 2.1, [170, 90, 70]);
}

function deposit(kind: number): void {
  if (kind === 0) {                                                                        // stone: pale blocks piled up, one cut square
    box(-.55, -.4, 0, .1, .35, .5, [190, 184, 168]); box(.05, -.2, 0, .6, .45, .38, [172, 166, 150]); box(-.3, -.15, .5, .25, .3, .88, [200, 194, 176]);
    sphere(.4, -.45, .18, .2, [158, 152, 134], 'rough'); sphere(-.5, .4, .15, .17, [148, 142, 126], 'rough');
  } else if (kind === 1) {                                                                 // clay: a reddish wet mound
    sphere(0, 0, .12, .62, [176, 108, 80], 'rough'); sphere(.3, .2, .12, .4, [190, 120, 88], 'rough'); sphere(-.3, -.2, .1, .34, [164, 98, 72], 'rough');
    sphere(.1, -.1, .5, .18, [206, 148, 116], 'rough');
  } else if (kind === 2) {                                                                 // ore: dark rock with rust veins
    sphere(0, 0, .3, .55, [96, 94, 100], 'rough'); sphere(.4, .25, .2, .34, [84, 84, 92], 'rough'); sphere(-.3, .3, .18, .28, [104, 100, 104], 'rough');
    for (const [x, y, z] of [[.2, -.4, .5], [-.1, -.5, .3], [.5, -.1, .35], [.1, .1, .8]]) sphere(x, y, z, .1, [190, 112, 60], 'solid');
  } else {                                                                                 // berries: a green bush with red fruit
    sphere(0, 0, .4, .5, [70, 110, 62], 'rough'); sphere(.3, .15, .35, .36, [84, 124, 70], 'rough'); sphere(-.25, -.2, .3, .3, [62, 100, 58], 'rough');
    for (const [x, y, z] of [[.3, -.3, .45], [-.1, -.42, .55], [.5, .1, .6], [-.4, .1, .5], [.1, .35, .72], [-.2, -.05, .85]]) sphere(x, y, z, .07, [200, 52, 66], 'solid');
  }
}
function tree(variant: number): void {
  ensureBiomes();
  const greens: Color[] = [[56, 92, 62], [48, 82, 58], [70, 104, 64]];
  if (variant < 3) { pine(0, 0, TREE_HEIGHT[variant], needleColor(greens[variant], treeSeason), false, variant * 7); return; }
  const look = biomes.broad[treeSeason];
  capsule([0, 0, 0], [.05, 0, 2.3], .13, .07, flat([216, 210, 192]), 'rough');          // birch
  if (look.leaves === 0) {                                                               // bare: the twigs only
    for (let k = 0; k < 7; k++) {
      const a = k * 2.4, h = 1.5 + (k % 3) * .35, r = .5 + (k % 2) * .25;
      capsule([.04, 0, h], [Math.cos(a) * r, Math.sin(a) * r, h + .85], .04, .015, flat([150, 138, 120]), 'solid');
    }
    return;
  }
  for (const [x, y, z, r] of [[0, 0, 2.7, .62], [.42, .2, 2.25, .46], [-.4, -.2, 2.35, .5], [0, .32, 3.05, .42]]) {
    sphere(x, y, z, r, look.crown, 'rough');
    sphere(x + .12, y - .1, z + .2, r * .6, look.light, 'rough');
  }
  if (look.blossom > 0) for (let k = 0; k < 9; k++) sphere(Math.cos(k * 2.1) * .6, Math.sin(k * 2.1) * .5, 2.2 + (k % 4) * .28, .09, [246, 214, 222], 'solid');
}
/** Rock variants 0 and 1 are plain rocks; the others are deposits (constants.ts DEPOSIT_MODELS): stone blocks, a clay bank, veined ore, a berry bush. */
function rock(variant: number): void {
  if (variant >= 2) { deposit(variant - 2); return; }
  const grey: Color = variant === 0 ? [158, 152, 134] : [132, 128, 112];
  sphere(0, 0, .3, .55, grey, 'rough');
  sphere(.4, .25, .2, .35, [grey[0] + 14, grey[1] + 12, grey[2] + 10], 'rough');
  sphere(-.3, .3, .18, .28, grey, 'rough');
}

/** Reads the four bytes of a packed colour (whatever their order) so channels can be averaged. */
function mix(sum: number[], c: u32, w: number): void {
  sum[0] += (c & 255) * w; sum[1] += ((c >> 8) & 255) * w; sum[2] += ((c >> 16) & 255) * w; sum[3] += ((c >>> 24) & 255) * w;
}
/**
 * Rescales the picture in the buffer by f around the bake origin, for the "fixed detail" modes. Nearest sample per destination pixel, or (settings.resample = 1)
 * averaged: a 3 x 3 box when shrinking and a bilinear blend when enlarging, only over pixels the model covers, so its edges stay clean and its style is kept.
 */
function reduceBuffer(f: number, ox: number, oy: number): void {
  const reducedPix: u32[] = Array.from({ length: W * H }, (): u32 => 0);
  const reducedDepth: number[] = Array.from({ length: W * H }, (): number => -1e9);
  const smooth = settings.resample === 1, sum: number[] = [0, 0, 0, 0];
  for (let j = 0; j < pix.length; j++) {
    const sx = ox + (j % W - ox) / f, sy = oy + (Math.floor(j / W) - oy) / f;
    if (!smooth) {
      const x = Math.round(sx), y = Math.round(sy);
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const i = y * W + x;
      if (zb[i] <= -1e8) continue;
      reducedDepth[j] = zb[i]; reducedPix[j] = pix[i];
      continue;
    }
    sum[0] = 0; sum[1] = 0; sum[2] = 0; sum[3] = 0;
    let weight = 0, total = 0, depth = -1e9;
    if (f < 1) {                                                   // shrinking: average the source pixels under the destination pixel
      const r = .5 / f;
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
        const x = Math.round(sx + a * r * .66), y = Math.round(sy + b * r * .66);
        total++;
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        const i = y * W + x;
        if (zb[i] <= -1e8) continue;
        mix(sum, pix[i], 1); weight++; depth = Math.max(depth, zb[i]);
      }
    } else {                                                       // enlarging: blend the four nearest source pixels
      const x0 = Math.floor(sx), y0 = Math.floor(sy), fx = sx - x0, fy = sy - y0;
      for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) {
        const w = (a === 0 ? 1 - fx : fx) * (b === 0 ? 1 - fy : fy), x = x0 + a, y = y0 + b;
        total += w;
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        const i = y * W + x;
        if (zb[i] <= -1e8) continue;
        mix(sum, pix[i], w); weight += w; depth = Math.max(depth, zb[i]);
      }
    }
    if (weight * 2 < total || weight === 0) continue;               // the model covers less than half of this pixel: leave it empty
    const c0 = Math.round(sum[0] / weight), c1 = Math.round(sum[1] / weight), c2 = Math.round(sum[2] / weight), c3 = Math.round(sum[3] / weight);
    reducedPix[j] = (c0 | (c1 << 8) | (c2 << 16) | (c3 << 24)) >>> 0; reducedDepth[j] = depth;
  }
  for (let i = 0; i < pix.length; i++) { pix[i] = reducedPix[i]; zb[i] = reducedDepth[i]; }
  touchModelBuffer();
}

/** Forgets the baked sets (the detail mode changed). */
export function resetModels(): void { for (let i = 0; i < levelAtlases.length; i++) levelAtlases[i] = null; treeAtlases.clear(); }

/** The fire post: a plastered hall with red doors, a hose reel, water barrels and a bell tower on the roof ridge. */
function firehouse(): void {
  box(-.85, -.7, 0, .85, .7, 1.35, [222, 204, 170]);
  box(-.88, -.73, 0, .88, .73, .16, [150, 140, 126]);                       // plinth
  gableRoof(-1.0, 1.0, -.82, .82, 1.3, .85, [172, 80, 62], 13);
  gableWall(-.85, .85, .7, 1.35, .85, 1.0, [222, 204, 170]);
  box(-.45, .69, .16, .45, .75, 1.05, [176, 52, 44]); box(-.02, .74, .16, .02, .77, 1.05, [110, 30, 28]);   // the double doors
  box(.86, -.4, .65, .9, .1, 1.1, [70, 96, 92]);                           // window
  for (const x of [-.45, .45]) box(x - .05, -.45, 1.9, x + .05, -.35, 2.9, WOOD_BROWN);   // bell tower posts
  box(-.55, -.5, 2.85, .55, -.3, 2.95, WOOD_BROWN);
  gableRoof(-.6, .6, -.52, -.28, 2.9, .38, [172, 80, 62], 3);
  sphere(0, -.4, 2.45, .16, [196, 160, 70], 'solid');                      // the bell
  capsule([.95, .1, .12], [.95, .1, .65], .22, .22, flat([112, 120, 128]), 'rough');         // reel of hose
  capsule([.95, .1, .65], [.95, .55, .65], .12, .12, flat([196, 160, 70]), 'rough');
  for (const y of [-.2, .9]) { capsule([-.95, y, .1], [-.95, y, .6], .18, .18, flat([128, 92, 60]), 'rough'); sphere(-.95, y, .62, .15, [60, 90, 120], 'rough'); }   // water barrels
}

/** The repair works: an open timber shed with a trestle, planks and a ladder, a hammer on the bench and a heap of stones. */
function works(): void {
  box(-.9, -.8, 0, .9, .8, .12, WOOD_BROWN);                              // deck
  for (const x of [-.8, .75]) for (const y of [-.7, .65]) box(x, y, .12, x + .12, y + .12, 1.5, WOOD_BROWN);
  gableRoof(-.95, .95, -.85, .85, 1.5, .6, [150, 126, 92], 17);
  box(-.55, -.45, .12, .35, .05, .55, WOOD_HONEY);                       // bench
  for (let k = 0; k < 3; k++) box(-.5, -.4 + k * .1, .55 + k * .05, .3, -.32 + k * .1, .6 + k * .05, [214, 180, 120], k);
  box(-.1, .15, .55, .06, .4, .72, [96, 98, 104]); capsule([.12, .28, .62], [.45, .28, .62], .03, .03, flat(WOOD_BROWN), 'solid');   // hammer
  for (const y of [.5, .62]) capsule([.95, y, .1], [.95, y, 1.7], .03, .03, flat(WOOD_BROWN), 'solid');            // ladder rails
  for (let z = .3; z < 1.7; z += .26) capsule([.95, .5, z], [.95, .62, z], .02, .02, flat(WOOD_BROWN), 'solid');
  for (const [x, y, z, r] of [[.5, -.6, .14, .2], [.2, -.7, .12, .15], [.7, -.35, .1, .12]]) sphere(x, y, z, r, [190, 184, 168], 'rough');   // stones
}

/** The watch post: a timber tower on four legs, a railed platform with a pitched roof, a ladder and a lantern. */
function watchpost(): void {
  box(-.7, -.7, 0, .7, .7, .1, [150, 140, 126]);
  for (const x of [-.55, .5]) for (const y of [-.55, .5]) box(x, y, .1, x + .1, y + .1, 2.1, WOOD_BROWN);
  for (const z of [.8, 1.4]) { box(-.55, -.55, z, .6, -.45, z + .07, WOOD_BROWN); box(-.55, .5, z, .6, .6, z + .07, WOOD_BROWN); box(-.55, -.55, z, -.45, .6, z + .07, WOOD_BROWN); box(.5, -.55, z, .6, .6, z + .07, WOOD_BROWN); }
  box(-.7, -.7, 2.05, .7, .7, 2.15, WOOD_HONEY);                         // platform
  for (const k of [-.6, -.2, .2, .6]) { box(k - .03, -.7, 2.15, k + .03, -.66, 2.6, WOOD_BROWN); box(k - .03, .66, 2.15, k + .03, .7, 2.6, WOOD_BROWN); }
  box(-.7, -.7, 2.55, .7, -.66, 2.62, WOOD_BROWN); box(-.7, .66, 2.55, .7, .7, 2.62, WOOD_BROWN);
  for (const x of [-.62, .55]) for (const y of [-.62, .55]) box(x, y, 2.6, x + .07, y + .07, 3.4, WOOD_BROWN);
  gableRoof(-.8, .8, -.8, .8, 3.35, .6, [96, 108, 124], 21);
  sphere(.3, .3, 2.35, .1, [244, 200, 80], 'solid');                      // lantern
  for (const y of [.15, .27]) capsule([.7, y, .1], [.5, y, 2.1], .03, .03, flat(WOOD_BROWN), 'solid');            // ladder
}

/** The ruin: a charred foundation with broken wall stumps, fallen beams, scattered stones and ash. Also what a collapse leaves. */
function ruin(): void {
  box(-.8, -.8, 0, .8, .8, .08, [70, 64, 60]);                            // burnt floor
  for (let k = 0; k < 14; k++) {                                          // ash and scorch marks
    const x = -.7 + hash(k, 41) * 1.4, y = -.7 + hash(k, 42) * 1.4;
    box(x, y, .08, x + .2, y + .16, .1, k % 3 === 0 ? [40, 38, 38] : [96, 90, 84]);
  }
  box(-.8, -.8, .08, .8, -.68, .7, [120, 112, 100]); box(-.8, -.8, .08, -.68, .1, .5, [128, 120, 106]);   // wall stumps
  box(.55, .5, .08, .8, .8, .9, [112, 104, 94]); box(.2, .72, .08, .5, .8, .3, [136, 126, 110]);
  capsule([-.5, .1, .16], [.4, .4, .3], .08, .08, flat([48, 38, 32]), 'rough');                              // fallen beams
  capsule([-.2, .55, .12], [.5, -.2, .2], .07, .07, flat([58, 46, 38]), 'rough');
  capsule([.3, -.5, .5], [.6, -.1, .12], .06, .06, flat([40, 32, 28]), 'rough');
  for (const [x, y, z, r] of [[-.3, -.4, .14, .18], [.1, -.15, .12, .14], [-.55, .5, .12, .16], [.35, .2, .14, .12], [.7, -.5, .12, .15]]) sphere(x, y, z, r, [150, 142, 128], 'rough');
}

/**
 * The static models, in model-id order: [name, variants, draw]. Add an object: write its draw function, add a line here and give it an id above (an id is the
 * index of its first variant in this list, variants counted). They are baked through the atlas, so one cache and one invalidation serve all.
 */
const MODEL_DEFS: [string, number, (variant: number) => void][] = [
  ['house', 1, house], ['sawmill', 1, sawmill], ['lodge', 1, lodge], ['fishery', 1, fishery], ['storehouse', 1, storehouse], ['lumberhut', 1, lumberhut], ['smokehouse', 1, smokehouse], ['farm', 1, farm], ['mill', 1, mill], ['bakery', 1, bakery], ['market', 1, market], ['tannery', 1, tannery], ['well', 1, well], ['quarry', 1, quarry], ['claypit', 1, claypit], ['mine', 1, mine], ['forge', 1, forge], ['forager', 1, forager], ['apiary', 1, apiary], ['chandlery', 1, chandlery], ['meadery', 1, meadery], ['tavern', 1, tavern], ['firehouse', 1, firehouse], ['works', 1, works], ['watchpost', 1, watchpost], ['ruin', 1, ruin], ['gate', 1, gate], ['tree', 4, tree], ['rock', ROCK_VARIANTS, rock], ['house2', 1, house2], ['house3', 1, house3],
];

/** The atlas definition: one entry per model, one frame each (a static model has a single heading and pose). `reduceFrom` > 0 shrinks the sharp bake for the fixed-detail mode. */
function modelDef(scale: number, reduceFrom: number): AtlasDef {
  const entries: AtlasEntry[] = MODEL_DEFS.map((m: [string, number, (variant: number) => void]): AtlasEntry => ({
    name: m[0], variants: m[1], yaws: 1, poses: 1,
    // a static model is drawn at the bake origin; the stamp places it, so the position is not used
    draw: (a: AtlasAxes, _x: number, _y: number, _z: number): void => {
      m[2](a.variant);
      if (reduceFrom > 0) { reduceBuffer(scale / reduceFrom, W / 2, H * .6); setView(scale, W / 2, H * .6); }
      shadowMask.fill(0);                       // some models (pines) cast shadows while they are drawn
    },
  }));
  return { version: hashNumbers([1, scale, reduceFrom, settings.resample]), season: 0, entries };
}

/**
 * Makes `models` the set of a zoom level, baking it first if needed or when the light changed (the atlas header says so). `reduceFrom` is the scale of the sharp set
 * to shrink instead of lighting again at this level (0 = light it at its own scale). The caller points the renderer back at the camera afterwards.
 */
export function useModels(level: number, scale: number, reduceFrom: number): void {
  lastLevel = level; lastScale = scale; lastReduce = reduceFrom;
  setView(reduceFrom > 0 ? reduceFrom : scale, W / 2, H * .6);       // bake in the middle of the buffer; a stamp only keeps offsets from the origin
  let atlas = levelAtlases[level];
  if (atlas === null || atlas.stale()) { atlas = bakeAtlas(modelDef(scale, reduceFrom)); levelAtlases[level] = atlas; }
  models.length = 0;
  for (const m of MODEL_DEFS) for (let v = 0; v < m[1]; v++) {
    const frame = atlas.bake(m[0], { variant: v, yaw8: 0, pose: 0 });
    if (frame !== null) models.push(frame);
  }
}

/** Puts the trees of a season into `models` (baked once per zoom level and season, then kept). The caller points the renderer back at the camera afterwards (applyCamera). */
export function useTreeSeason(s: number): void {
  const key = lastLevel * 4 + s;
  setView(lastReduce > 0 ? lastReduce : lastScale, W / 2, H * .6);
  let atlas = treeAtlases.get(key);
  if (atlas === undefined || atlas.stale()) {
    const def: AtlasDef = { version: hashNumbers([2, lastScale, lastReduce, settings.resample]), season: s, entries: [{
      name: 'tree', variants: 4, yaws: 1, poses: 1,
      draw: (a: AtlasAxes, _x: number, _y: number, _z: number): void => {
        treeSeason = s; tree(a.variant); treeSeason = 1;
        if (lastReduce > 0) { reduceBuffer(lastScale / lastReduce, W / 2, H * .6); setView(lastScale, W / 2, H * .6); }
        shadowMask.fill(0);
      },
    }] };
    atlas = bakeAtlas(def); treeAtlases.set(key, atlas);
  }
  for (let v = 0; v < 4; v++) { const frame = atlas.bake('tree', { variant: v, yaw8: 0, pose: 0 }); if (frame !== null) models[MODEL_TREE + v] = frame; }
}
