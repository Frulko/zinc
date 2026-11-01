// Headless proofs of the hamlet's baked models and atlas (CachedModel box and round trip). No window.
import { W, H, pix, zb, setView, configureRenderer, beginModel, captureModel, setFullModelScan, CachedModel, box, capsule, sphere, plot, rgb, setLighting, project, bakeAtlas, hashNumbers, hashText, headerKey, AtlasDef } from '../../../examples/hamlet/src/pixel';
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

console.log(failures === 0 ? 'hamlet atlas: ALL PASS' : 'hamlet atlas: ' + failures + ' FAIL');
