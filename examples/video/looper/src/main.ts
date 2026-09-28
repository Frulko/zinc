// looper: a fullscreen video looper in the spirit of videolooper.de / adafruit pi_video_looper. It plays every video
// of a folder (or an M3U playlist) in a seamless loop; settings come from video_looper.ini and/or CLI flags.
// Usage: looper [folder] [--config file.ini] [--is_random] [--bgcolor "0,0,0"] [--osd false] ...   (see README.md)
// Keys: Right (k) skip, Left (b) back, Enter (s) stop/start, Space pause, Tab info, Esc quit.
import * as gfx from 'zinc:gfx';
import * as storage from 'zinc:storage';
import { loadSettings, setting, flag, num, color, log } from './config';
import { Playlist, baseName } from './playlist';
import { watchButtons } from './buttons';
import { drawScreen, drawTitle, drawPaused, drawInfo } from './osd';

const iniFile = loadSettings();
const W = gfx.width(), H = gfx.height();
const BG = color('bgcolor'), FG = color('fgcolor');

let playlist = new Playlist(W, H);
log(`${playlist.count} file(s) in ${setting('path')}${iniFile !== '' ? ` (config ${iniFile})` : ''}`);

// ---------------------------------------------------------------- playback state
let countdown = flag('osd') && playlist.count > 0 ? num('countdown_time') : 0;   // seconds before the first file
let started = false;                        // playback began (after the countdown or Enter)
let stopped = !flag('play_on_startup');     // Enter toggles
let paused = false;
let showInfo = flag('info');
let waitLeft = 0;                           // wait_time countdown between files
let rescanIn = 0;                           // empty folder: seconds until the next scan
let lastIndex = -1, titleLeft = 0, fps = 0;

/** First start: resumes the saved position when resume_playlist is on. */
function start(): void {
  const player = playlist.player;
  if (flag('resume_playlist')) {
    const saved = parseInt(storage.get('looper.index'));
    if (!isNaN(saved) && saved >= 0 && saved < player.count) { player.jump(saved); return; }
  }
  player.play();
}

function toggleStop(): void {
  stopped = !stopped;
  if (stopped) { playlist.player.stop(); log('stopped'); }
  else { playlist.player.play(); log('started'); }
}

function togglePause(): void {
  paused = !paused;
  playlist.player.pause(paused);
  log(paused ? 'paused' : 'resumed');
}

/** GPIO actions: K_SPACE / K_k / K_b / K_s keys, "+n" / "-n" relative jumps, an index, or a file name / title. */
function runAction(action: string): void {
  if (!started) return;
  const player = playlist.player;
  if (action === 'K_SPACE') togglePause();
  else if (action === 'K_k') player.next();
  else if (action === 'K_b') player.previous();
  else if (action === 'K_s') toggleStop();
  else if (action.startsWith('+') || action.startsWith('-')) {
    const n = player.count, step = parseInt(action);
    if (n > 0 && !isNaN(step)) player.jump((((player.index + step) % n) + n) % n);
  } else {
    const index = parseInt(action);
    if (!isNaN(index) && `${index}` === action) { if (index >= 0 && index < player.count) player.jump(index); return; }
    const t = playlist.titles.findIndex((x: string) => x === baseName(action));
    if (t >= 0) player.jump(t);
  }
}
watchButtons(runAction);

function handleKeys(): void {
  if (!flag('keyboard_control')) return;
  const player = playlist.player;
  if (gfx.wasPressed(gfx.Btn.Right)) player.next();
  if (gfx.wasPressed(gfx.Btn.Left)) player.previous();
  if (gfx.wasPressed(gfx.Btn.Start)) {
    if (!started) { started = true; countdown = 0; stopped = false; start(); }
    else toggleStop();
  }
  if (gfx.wasPressed(gfx.Btn.A)) togglePause();
  if (gfx.wasPressed(gfx.Btn.Select)) showInfo = !showInfo;
}

// ---------------------------------------------------------------- screens before playback
/** Nothing to play: rescan the folder every 2 s (a USB stick may show up) and show the OSD message. */
function waitForMedia(dt: number): void {
  rescanIn -= dt;
  if (rescanIn <= 0) {
    rescanIn = 2;
    playlist.player.close();
    playlist = new Playlist(W, H);
    if (playlist.count > 0) countdown = flag('osd') ? num('countdown_time') : 0;
  }
  if (flag('osd')) drawScreen('Insert USB drive with compatible movies.', `No videos in ${setting('path')}`, FG);
}

/** "Found N movies, starting in 5..." then the first file. Returns true while playback has not started. */
function beforePlayback(dt: number): boolean {
  if (started) return false;
  if (countdown > 0) {
    countdown -= dt;
    const n = playlist.count;
    drawScreen(`Found ${n} movie${n === 1 ? '' : 's'}.`, `Starting playback in ${Math.ceil(countdown)}...`, FG);
    return true;
  }
  if (stopped) return true;
  started = true;
  start();
  return false;
}

// ---------------------------------------------------------------- playback
/** wait_time: the file stopped on its own (ONE_SHOT); show the background for a while, then play the next one. */
function waitBetweenFiles(dt: number): void {
  if (num('wait_time') <= 0 || flag('one_shot_playback') || stopped || playlist.player.playing) return;
  if (waitLeft <= 0) waitLeft = num('wait_time');
  waitLeft -= dt;
  if (waitLeft <= 0) playlist.player.play();
}

/** A new file started: log it, save the position, restart the title timer. */
function trackCurrentFile(): void {
  const player = playlist.player, i = player.index;
  if (i === lastIndex || i < 0) return;
  lastIndex = i;
  titleLeft = num('title_duration');
  log(`playing ${i + 1}/${player.count} ${playlist.titles[i]} (${player.decoder})`);
  if (flag('resume_playlist')) storage.set('looper.index', `${i}`);
}

function drawOverlays(dt: number): void {
  const player = playlist.player, i = player.index;
  // title_duration -1 keeps the title on screen
  if (flag('show_titles') && i >= 0 && (titleLeft > 0 || num('title_duration') < 0)) {
    titleLeft -= dt;
    drawTitle(playlist.titles[i]);
  }
  if (paused) drawPaused();
  if (showInfo) {
    drawInfo(`${i + 1} / ${player.count}  ${i >= 0 ? playlist.titles[i] : ''}`, [
      { label: 'Position', value: `${player.position.toFixed(2)} / ${player.duration.toFixed(2)} s · loop ${player.loops}` },
      { label: 'Decoder', value: `${player.decoder} · ${player.width}x${player.height}` },
      { label: 'Frames', value: `${player.frames} shown · ${player.dropped} dropped · ${fps.toFixed(0)} fps` },
    ]);
  }
}

gfx.onFrame((dt: number) => {
  fps = fps * 0.95 + (dt > 0 ? 1 / dt : 0) * 0.05;
  handleKeys();
  gfx.clear(BG);
  if (playlist.count === 0) { waitForMedia(dt); return; }
  if (beforePlayback(dt)) return;
  waitBetweenFiles(dt);
  playlist.player.draw(0, 0, W, H);
  trackCurrentFile();
  drawOverlays(dt);
});
