// The viewer end of the remote display pair test: connects to RV_PORT on loopback, draws the received screen 1:1 and saves the screen it shows (RV_SHOT) once it has seen a few frames and quits.
import { onFrame, clear, quit, capture } from 'zinc:gfx';
import * as remote from 'zinc:remote';
import * as sys from 'zinc:sys';

let session: remote.Session | null = null;
let seen = 0;
remote.connect('127.0.0.1', parseInt(sys.env('RV_PORT'))).then((s: remote.Session) => { session = s; });
onFrame((dt: number) => {
  clear(0x000000);
  const s = session;
  if (s === null) return;
  s.view(0, 0, 320, 240);
  if (s.frames >= 1) seen++;
  if (seen >= 5) { capture(sys.env('RV_SHOT')); quit(); }
});
