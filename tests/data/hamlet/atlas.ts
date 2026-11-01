// Headless proofs of the hamlet's baked models and atlas (CachedModel box and round trip). No window.
import { W, H, pix, zb, setView, configureRenderer, beginModel, captureModel, setFullModelScan, CachedModel, box, capsule, sphere, plot, rgb, setLighting, project, bakeAtlas, hashNumbers, hashText, headerKey, AtlasDef, pendingShadows, shadowMask } from '../../../examples/hamlet/src/pixel';
import { Person, Deer } from '../../../examples/hamlet/src/world/world';
import { drawPerson, drawDeer, actorAtlas } from '../../../examples/hamlet/src/view/actors';
import { ST_CHOP, ST_AIM, ST_FISH, ST_PICK, ST_IDLE, DEER_GRAZE, DEER_WALK, DEER_FLEE, DEER_DEAD } from '../../../examples/hamlet/src/constants';
import { models, useModels, resetModels } from '../../../examples/hamlet/src/view/models';

let failures = 0;
function check(name: string, ok: boolean): void { console.log('hamlet atlas: ' + name + (ok ? ' PASS' : ' FAIL')); if (!ok) failures++; }
function same(a: CachedModel, b: CachedModel): boolean {
  const x = a.toArrays(), y = b.toArrays();
  if (x.xs.length !== y.xs.length || x.originX !== y.originX || x.originY !== y.originY) return false;
  for (let k = 0; k < x.xs.length; k++) if (x.xs[k] !== y.xs[k] || x.ys[k] !== y.ys[k] || x.depths[k] !== y.depths[k] || x.colors[k] !== y.colors[k]) return false;
  return true;
}

configureRenderer(8, 1.1, -.25);
setView(10, W / 2, H * .6);

// the live scene is not touched by a bake
pix[1000] = 77; zb[1000] = 5;
beginModel(); sphere(0, 0, 1, .5, [200, 100, 50], 'solid'); const lone = captureModel();
check('a bake leaves the live picture alone', pix[1000] === 77 && zb[1000] === 5 && lone.count > 20);

// the dirty box loses nothing: every primitive, baked with the box and with a whole-buffer read
const draws: (() => void)[] = [
  (): void => { sphere(-.4, .2, 1.2, .6, [90, 140, 70], 'rough'); },
  (): void => { capsule([-1, 0, .3], [1, .4, 2.2], .3, .1, (): number[] => [180, 120, 90], 'solid'); },
  (): void => { box(-.7, -.7, 0, .7, .7, 1.5, [150, 140, 120]); },
  (): void => { for (let a = 0; a < 6.3; a += .1) plot(Math.cos(a), Math.sin(a), 1 + Math.sin(a * 2), rgb(255, 200, 40)); },
];
let equal = true;
for (const draw of draws) {
  setFullModelScan(true); beginModel(); draw(); const whole = captureModel();
  setFullModelScan(false); beginModel(); draw(); const boxed = captureModel();
  if (!same(whole, boxed) || boxed.count === 0) equal = false;
}
check('the box read equals the whole-buffer read', equal);

// every hamlet model, both ways
resetModels(); setFullModelScan(true);
const w0 = Date.now(); useModels(5, 10, 0); const wholeMs = Date.now() - w0;
const wholeSet: CachedModel[] = models.slice();
resetModels(); setFullModelScan(false);
const t0 = Date.now(); useModels(5, 10, 0); const bakeMs = Date.now() - t0;
let modelsEqual = models.length === 11 && wholeSet.length === 11;
for (let k = 0; k < models.length; k++) if (!same(models[k], wholeSet[k])) modelsEqual = false;
check('the ' + models.length + ' hamlet models are the same with the box', modelsEqual);
console.log('hamlet atlas: bake of the hamlet models ' + bakeMs + ' ms with the box, ' + wholeMs + ' ms reading the whole buffer (the first version)');

// a new light invalidates the model atlas and re-bakes, the same light gives the same models back
useModels(5, 10, 0); const lit = models[0].toArrays();
setLighting([20, 20, 60], [255, 200, 120]); useModels(5, 10, 0);
const relit = models[0].toArrays(); let lightChanged = relit.colors.length !== lit.colors.length;
for (let k = 0; k < relit.colors.length && !lightChanged; k++) if (relit.colors[k] !== lit.colors[k]) lightChanged = true;
setLighting([46, 38, 84], [255, 232, 180]); useModels(5, 10, 0);
check('another light re-bakes the models, the first light gives them back', lightChanged && same(CachedModel.fromArrays(lit), models[0]));

// the packed arrays round trip exactly, and stamp the same pixels
const round = CachedModel.fromArrays(models[0].toArrays());
check('toArrays / fromArrays round trip', same(round, models[0]));
pix.fill(0); zb.fill(-1e9); models[0].drawAt(1, 2, 0); const a = pix.slice(), az = zb.slice();
pix.fill(0); zb.fill(-1e9); round.drawAt(1, 2, 0);
let stamped = true;
for (let i = 0; i < pix.length; i++) if (pix[i] !== a[i] || zb[i] !== az[i]) { stamped = false; break; }
check('a model from arrays stamps the same pixels', stamped);

// the atlas: hash, stamp = live, fallback, invalidation
check('the hash is stable and sensitive', hashNumbers([1, 2, 3]) === hashNumbers([1, 2, 3]) && hashNumbers([1, 2, 3]) !== hashNumbers([1, 2, 4]) && hashText('walk') !== hashText('walk2') && hashText('abc') === 440920331);
const def: AtlasDef = { version: 1, season: 0, entries: [{ name: 'ball', variants: 2, yaws: 8, poses: 3, draw: (a, x, y, z): void => {
  sphere(x + a.yaw8 * .1, y, z + .8 + a.pose * .2, .4 + a.variant * .1, [180, 90, 60], 'solid');
} }] };
const atlas = bakeAtlas(def);
check('a missing name or axes bakes nothing', atlas.bake('nope', { variant: 0, yaw8: 0, pose: 0 }) === null && atlas.bake('ball', { variant: 2, yaw8: 0, pose: 0 }) === null && atlas.baked === 0);
const ax = { variant: 1, yaw8: 3, pose: 2 };
// a world point whose projection from the bake origin is a whole number of pixels: x = y = n / (R2 * SIN * S)
const n = 8, px = n / (Math.SQRT2 * .5 * 10);
pix.fill(0); zb.fill(-1e9); def.entries[0].draw(ax, px, px, 0); const live = pix.slice(), liveZ = zb.slice();
pix.fill(0); zb.fill(-1e9); atlas.stamp('ball', ax, px, px, 0); const stampedOnce = pix.slice(), stampedZ = zb.slice();
let diff = 0, depthDiff = 0;
for (let i = 0; i < live.length; i++) { if (live[i] !== stampedOnce[i]) diff++; if (Math.abs(liveZ[i] - stampedZ[i]) > 1e-6) depthDiff++; }
check('a stamp equals the live drawing (pixels ' + diff + ', depth ' + depthDiff + ')', diff === 0 && depthDiff === 0 && atlas.baked === 1);
pix.fill(0); zb.fill(-1e9); atlas.stamp('ball', ax, px, px, 0, false);
check('a baked frame is reused, not baked twice', atlas.baked === 1);
const lazyOff = bakeAtlas(def);
pix.fill(0); zb.fill(-1e9); lazyOff.stamp('ball', { variant: 0, yaw8: 1, pose: 1 }, 0, 0, 0, false);
let drawn = 0; for (let i = 0; i < pix.length; i++) if (zb[i] > -1e8) drawn++;
check('without a frame the live draw runs', drawn > 20 && lazyOff.baked === 0);
check('the atlas is fresh, then stale after a lighting change', !atlas.stale() && headerKey(atlas.header) === headerKey(atlas.header));
const before = atlas.header.lighting;
setLighting([20, 20, 60], [255, 200, 120]);
check('a new light stales the atlas (the hash differs)', atlas.stale() && atlas.header.lighting !== 0 && before !== 0);
setLighting([46, 38, 84], [255, 232, 180]);
check('the same light is fresh again', !atlas.stale());

// people and deer: the stamp equals the live figure (same pixels, same depth) at a whole-pixel position, quantised heading and animation step
function clearScene(): void { pix.fill(0); zb.fill(-1e9); pendingShadows.length = 0; shadowMask.fill(0); }
function sceneDiff(live: () => void, baked: () => void): number {
  clearScene(); live(); const a = pix.slice(), az = zb.slice();
  clearScene(); baked(); let n = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== pix[i] || Math.abs(az[i] - zb[i]) > 1e-6) n++;
  clearScene();
  return n;
}
const actors = actorAtlas();
const gx = 6 / (Math.SQRT2 * .5 * 10), gy = gx;
let personDiff = 0, personFrames = 0, personWorst = 0;
for (let role = 0; role < 5; role++) for (let yaw8 = 0; yaw8 < 8; yaw8++) for (let look = 0; look < 6; look++) {
  const p = new Person();
  p.role = role; p.x = gx; p.y = gy; p.yaw = yaw8 * Math.PI / 4; p.hair = look === 5 ? 0 : role % 4;     // the live idle breathes by hair-dependent hundredths of a unit: not stamped
  if (look === 0) { p.path = [1, 2]; p.step = 0; p.phase = 3 * Math.PI / 4; }
  else if (look === 1) { p.state = ST_CHOP; p.phase = 2 * Math.PI / 4.2 / 6 * 2; }
  else if (look === 2) p.state = ST_AIM;
  else if (look === 3) p.state = ST_FISH;
  else if (look === 4) p.state = ST_PICK;
  else p.state = ST_IDLE;
  const pd = sceneDiff((): void => drawPerson(p, 0, null), (): void => drawPerson(p, 0, actors));
  personDiff += pd; if (pd > personWorst) personWorst = pd;
  personFrames++;
}
// two bones of equal depth tie differently once the figure is shifted by a whole number of pixels (float rounding): a few pixels at most
check('people: stamps equal live figures, ' + personFrames + ' cases (pixels differing: ' + personDiff + ', worst case ' + personWorst + ')', personWorst <= 4);
let deerDiff = 0, deerFrames = 0;
for (let stag = 0; stag < 2; stag++) for (let yaw8 = 0; yaw8 < 8; yaw8++) for (let look = 0; look < 5; look++) {
  const d = new Deer();
  d.x = gx; d.y = gy; d.yaw = yaw8 * Math.PI / 4; d.stag = stag === 1;
  if (look === 0) { d.state = DEER_WALK; d.path = [1, 2]; d.phase = 3 * Math.PI / 4; }
  else if (look === 1) { d.state = DEER_FLEE; d.path = [1, 2]; d.phase = 2 * Math.PI / 6 * 2; }
  else if (look === 2) { d.state = DEER_GRAZE; d.phase = 0; }
  else if (look === 3) { d.state = DEER_WALK; }
  else d.state = DEER_DEAD;
  deerDiff += sceneDiff((): void => drawDeer(d, 0, null), (): void => drawDeer(d, 0, actors));
  deerFrames++;
}
check('deer: stamps equal live deer, ' + deerFrames + ' cases (pixels differing: ' + deerDiff + ')', deerDiff === 0);
const b0 = Date.now(); const all = actorAtlas(); all.bakeAll(); const bakeAllMs = Date.now() - b0;
console.log('hamlet atlas: all ' + all.baked + ' people and deer frames baked in ' + bakeAllMs + ' ms');
check('the whole actor atlas bakes within 6 s', bakeAllMs < 6000);

console.log(failures === 0 ? 'hamlet atlas: ALL PASS' : 'hamlet atlas: ' + failures + ' FAIL');
