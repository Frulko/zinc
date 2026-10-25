// Paint Arena: a LAN paint-ball match in a raycast 3D arena, for the Mac, the PSP, the PS Vita and the 3DS together (one source).
// `zinc run examples/lan-arena` hosts a match on the Mac (and plays in it); a console finds it on the Wi-Fi and joins with Cross.
// Options: --host (the desktop's default), --search (the title screen, a console's default), --join <address>, --solo, --bots <n>,
// --name <name>, --log (what happens, one line each), --stats (the frame's own time). Environment: ARENA_SERVER=<address> joins it
// at once (the manual fallback when broadcasts do not cross the network; zinc:storage key 'server' does the same on a console),
// ARENA_PORT (default 47800), ARENA_STATS=1, ARENA_FLAGS (options for a console build).
import { onFrame, quit } from 'zinc:gfx';
import { args, env, platform, clock } from 'zinc:sys';
import { get } from 'zinc:storage';
import { Game, TITLE } from './state';
import { Controls, readControls } from './input';
import { View, drawView } from './render/view';
import { drawHud, drawTitle } from './render/hud';
import { playEvents } from './sound';
import { PORT } from './constants';

// a console has no command line: ARENA_FLAGS (built in with tools/build-console-core --env) gives it the same options
const argv = env('ARENA_FLAGS').length > 0 ? args().concat(env('ARENA_FLAGS').split(' ')) : args();
function option(name: string): string { const i = argv.indexOf(name); return i >= 0 && i + 1 < argv.length ? argv[i + 1] : ''; }
function flag(name: string): boolean { return argv.indexOf(name) >= 0; }

const os = platform();
const desktop = os === 'macos' || os === 'linux' || os === 'windows';
const label = os === 'psp' ? 'PSP' : os === 'vita' ? 'Vita' : os === 'n3ds' ? '3DS' : os === 'macos' ? 'Mac' : 'PC';
const port = env('ARENA_PORT').length > 0 ? parseInt(env('ARENA_PORT')) : PORT;
const game = new Game(port, option('--name').length > 0 ? option('--name') : label);
game.autoName = option('--name').length === 0;
game.log = flag('--log');
game.autoJoin = flag('--auto');
game.autoFire = flag('--autofire');
const seconds = option('--seconds').length > 0 ? parseFloat(option('--seconds')) : 0;   // quits after that long (the tests)
const born = clock();
if (option('--bots').length > 0) game.botTarget = parseInt(option('--bots'));
const stats = flag('--stats') || env('ARENA_STATS') === '1';

// where to start: an address given (option, environment, storage), else the desktop hosts and a console looks for hosts
let server = option('--join');
if (server.length === 0) server = env('ARENA_SERVER');
if (server.length === 0 && !desktop) server = get('server');
let started = false;
function start(): void {
  if (flag('--solo')) { game.startSolo(); return; }
  if (server.length > 0) {
    const colon = server.indexOf(':');
    game.join(colon > 0 ? server.slice(0, colon) : server, colon > 0 ? parseInt(server.slice(colon + 1)) : port);
    return;
  }
  if (desktop && !flag('--search')) game.startHost();
}

const controls = new Controls();
const view = new View();
let frames: i32 = 0, spent = 0, worst = 0;

onFrame((dt: number) => {
  const t0 = stats ? clock() : 0;
  frames++;
  if (seconds > 0 && clock() - born > seconds * 1000) { game.leave('done'); quit(); return; }
  if (!started && (game.net.up() || game.net.status < 0)) { started = true; start(); }
  readControls(controls);
  game.update(Math.min(dt, 0.1), controls);
  const me = game.me;
  if (game.mode === TITLE || me === null) drawTitle(game, (Math.floor(frames / 20) % 4) as i32);
  else {
    drawView(game.world, me, view);
    drawHud(game, me);
  }
  playEvents(game.world.events, me === null ? -1 : me.id);
  if (!stats) return;
  const ms = clock() - t0;
  spent += ms;
  worst = Math.max(worst, ms);
  if (frames % 120 === 0) {
    console.log(`stats frame ${frames} players ${game.world.players.length} balls ${game.world.balls.length} avg_ms ${(spent / 120).toFixed(2)} max_ms ${worst.toFixed(2)}`);
    spent = 0;
    worst = 0;
  }
});
