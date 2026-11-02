// Headless proof of the far-animal model (engine/wild.ts): on a big map the animals far from every building and the camera fall asleep as counts, wake near the camera, and the same run gives the same numbers on every engine.
import { world, generate as generateWith, tileIndex, tileAt, newBuilding } from '../../../examples/hamlet/src/world/world';
import { dailyWild, wakeNearCamera, FAR_TILES } from '../../../examples/hamlet/src/engine/wild';
import { TerrainParams } from '../../../examples/hamlet/src/gen/terrain';
import { ANIMAL_CAP, DEER_GONE, DEER_DEAD, ROLE_NAMES } from '../../../examples/hamlet/src/constants';
import { economy, loadEconomy } from '../../../examples/hamlet/src/world/economy';
import { MODEL_IDS } from '../../../examples/hamlet/src/view/models';
import * as fs from 'zinc:fs';

let failures = 0;
function check(name: string, ok: boolean): void { console.log('hamlet wild: ' + name + (ok ? ' PASS' : ' FAIL')); if (!ok) failures++; }
loadEconomy(fs.readText('examples/hamlet/assets/economy.json'), MODEL_IDS, ROLE_NAMES);
const awake = (): number => { let n = 0; for (const d of world.deer) if (d.state !== DEER_GONE && d.state !== DEER_DEAD) n++; return n; };
const p = new TerrainParams(); p.biomes = 0;
generateWith(3, 256, p);
const placed = awake();
check('a 256 map places at most the cap (' + placed + ')', placed > 100 && placed <= ANIMAL_CAP + 10);
newBuilding(economy.typeOf('house'), tileIndex(130, 128), 1, 1);
world.watch = -1;
dailyWild();
const afterSleep = awake();
check('far animals fall asleep (' + placed + ' awake, ' + afterSleep + ' awake and ' + world.sleeping + ' asleep)', afterSleep < placed && world.sleeping > 0);
// the animals near the building stay awake: none sleeps within FAR_TILES of it
let near = 0, nearBefore = 0;
for (const d of world.deer) if (d.state !== DEER_GONE && d.state !== DEER_DEAD) { const t = tileAt(d.x, d.y); if (Math.abs((t % 256) - 130) <= FAR_TILES && Math.abs(Math.floor(t / 256) - 128) <= FAR_TILES) near++; }
nearBefore = near;
check('animals near the building are untouched (' + nearBefore + ')', nearBefore > 0 || placed < 300);
// the camera comes to a far corner: the animals there are placed again
const corner = tileIndex(240, 240);
const before = awake();
world.watch = corner;
wakeNearCamera();
const woke = awake() - before;
let sum = 0;
for (const d of world.deer) if (d.state !== DEER_GONE && d.state !== DEER_DEAD) sum += Math.round(d.x * 7 + d.y * 13);
check('the camera wakes the animals of the corner (' + woke + ')', woke > 0);
console.log('hamlet wild: summary awake ' + placed + ' ' + afterSleep + ' sleeping ' + world.sleeping + ' woke ' + woke + ' sum ' + sum);
console.log(failures === 0 ? 'hamlet wild: ALL PASS' : 'hamlet wild: ' + failures + ' FAILED');
