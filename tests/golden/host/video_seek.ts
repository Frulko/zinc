// A seek shows the picture of that moment, stays paused when paused, and a rate moves time at that speed; the playhead runs between two pictures.
import { onFrame, clear, quit } from 'zinc:gfx';
import { Player, LOOP } from 'zinc:video';
import * as sys from 'zinc:sys';

const p = new Player(0, 0);
p.repeat = LOOP;
p.add(sys.env('VIDEO_A'));
p.play();

const near = (a: number, b: number, within: number): boolean => Math.abs(a - b) <= within;
const say = (what: string, ok: boolean, detail: string): void => { console.log(`${ok ? 'ok' : 'FAIL'} ${what} ${detail}`); };
let step: i32 = 0, since = 0, heldAt = 0, startedAt = 0, moved = false, last = -1;
const go = (next: i32): void => { step = next; since = Date.now(); };

onFrame((dt: number) => {
  clear(0);
  const now = Date.now(), waited = now - since;
  if (step === 0) {
    if (p.frames < 2) return;
    p.pause(true);
    p.seek(0.3);
    go(1);
  } else if (step === 1) {
    if (p.seeking) { if (waited > 5000) { say('seek', false, 'never ends'); quit(); } return; }
    say('seek', near(p.position, 0.3, 0.05), `position ${p.position}`);
    say('paused seek', p.paused, '');
    heldAt = p.playhead;
    go(2);
  } else if (step === 2) {
    if (waited < 300) return;
    say('hold', p.playhead === heldAt, `playhead ${heldAt} then ${p.playhead}`);
    p.pause(false);
    startedAt = p.playhead;
    last = p.playhead;
    go(3);
  } else if (step === 3) {
    const head = p.playhead;
    if (head < last) say('playhead', false, `went back from ${last} to ${head}`);
    if (head !== p.position) moved = true;
    last = head;
    if (waited < 500) return;
    say('normal speed', near(head - startedAt, waited / 1000, 0.05), `${head - startedAt} s in ${waited / 1000}`);
    say('playhead between pictures', moved, '');
    p.rate = 2;
    startedAt = head;
    go(4);
  } else if (step === 4) {
    if (waited < 500) return;
    const head = p.playhead;
    say('double speed', near(head - startedAt, 2 * waited / 1000, 0.05), `${head - startedAt} s in ${waited / 1000}`);
    quit();
  }
});
