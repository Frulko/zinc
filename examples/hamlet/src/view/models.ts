import { W, H, pix, zb, setView, Color, CachedModel, rgb, beginModel, captureModel, touchModelBuffer, box, capsule, sphere, plot, rampOf, hash, shadowMask, pine, Atlas, AtlasAxes, AtlasDef, AtlasEntry, bakeAtlas, hashNumbers } from '../pixel';
import { ZOOM_SCALES } from './camera';
import { settings } from '../settings';
import { STONE, WOOD_HONEY, WOOD_BROWN, BARK, TERRACOTTA } from '../palettes';

// Every static object is lit and rasterised once into a CachedModel (same projection, light and ramps as the Pixel Plays games),
// then stamped on the scene wherever it stands. Add an object: write a function, push it in buildModels, give it an index.
export const MODEL_HOUSE = 0;
export const MODEL_SAWMILL = 1;
export const MODEL_LODGE = 2;
export const MODEL_FISHERY = 3;
/** The model id of each building type, in the order of assets/economy.json (a building's model sits at its own index). */
export const MODEL_IDS: string[] = ['house', 'sawmill', 'lodge', 'fishery', 'storehouse', 'lumberhut', 'smokehouse', 'farm', 'mill', 'bakery', 'market'];
export const MODEL_GATE = MODEL_IDS.length;
export const MODEL_TREE = MODEL_GATE + 1;            // 4 variants
export const MODEL_ROCK = MODEL_TREE + 4;            // 2 variants
export const MODEL_HOUSE_UP = MODEL_ROCK + 2;         // the house at level 2 and 3 (level 1 is MODEL_HOUSE)
/** The model of a building on the map: houses change with their level. */
export function modelOf(type: number, level: number): number { return type === 0 && level > 0 ? MODEL_HOUSE_UP + Math.min(level, 2) - 1 : MODEL_HOUSE + type; }
export const TREE_HEIGHT: number[] = [2.8, 3.3, 3.8, 3.2];
/** The models of the zoom level in use. Each level has its own set, baked once (the stamp depends on pixels per unit). */
export const models: CachedModel[] = [];
const levelAtlases: (Atlas | null)[] = ZOOM_SCALES.map((_s: number): Atlas | null => null);

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

/** The entrance of the hamlet: two posts, a beam and a banner over the road (which runs along x). */
function gate(): void {
  for (const y of [-.92, .78]) box(-.12, y, 0, .12, y + .16, 2.3, WOOD_BROWN);
  box(-.15, -.96, 2.1, .15, .96, 2.38, WOOD_HONEY);
  box(-.04, -.4, 1.45, .04, .4, 2.1, [170, 90, 70]);
}

function tree(variant: number): void {
  const greens: Color[] = [[56, 92, 62], [48, 82, 58], [70, 104, 64]];
  if (variant < 3) { pine(0, 0, TREE_HEIGHT[variant], greens[variant], false, variant * 7); return; }
  capsule([0, 0, 0], [.05, 0, 2.3], .13, .07, flat([216, 210, 192]), 'rough');          // birch
  for (const [x, y, z, r] of [[0, 0, 2.7, .62], [.42, .2, 2.25, .46], [-.4, -.2, 2.35, .5], [0, .32, 3.05, .42]]) {
    sphere(x, y, z, r, [118, 148, 76], 'rough');
    sphere(x + .12, y - .1, z + .2, r * .6, [146, 168, 92], 'rough');
  }
}
function rock(variant: number): void {
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
export function resetModels(): void { for (let i = 0; i < levelAtlases.length; i++) levelAtlases[i] = null; }

/**
 * The static models, in model-id order: [name, variants, draw]. Add an object: write its draw function, add a line here and give it an id above (an id is the
 * index of its first variant in this list, variants counted). They are baked through the atlas, so one cache and one invalidation serve all.
 */
const MODEL_DEFS: [string, number, (variant: number) => void][] = [
  ['house', 1, house], ['sawmill', 1, sawmill], ['lodge', 1, lodge], ['fishery', 1, fishery], ['storehouse', 1, storehouse], ['lumberhut', 1, lumberhut], ['smokehouse', 1, smokehouse], ['farm', 1, farm], ['mill', 1, mill], ['bakery', 1, bakery], ['market', 1, market], ['gate', 1, gate], ['tree', 4, tree], ['rock', 2, rock], ['house2', 1, house2], ['house3', 1, house3],
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
  setView(reduceFrom > 0 ? reduceFrom : scale, W / 2, H * .6);       // bake in the middle of the buffer; a stamp only keeps offsets from the origin
  let atlas = levelAtlases[level];
  if (atlas === null || atlas.stale()) { atlas = bakeAtlas(modelDef(scale, reduceFrom)); levelAtlases[level] = atlas; }
  models.length = 0;
  for (const m of MODEL_DEFS) for (let v = 0; v < m[1]; v++) {
    const frame = atlas.bake(m[0], { variant: v, yaw8: 0, pose: 0 });
    if (frame !== null) models.push(frame);
  }
}
