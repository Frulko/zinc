import { SkinnedModel, AnimationPlayer, AnimationEvent } from 'zinc:animation';
import { readText } from 'zinc:assets';
import { env } from 'zinc:sys';
function check(ok: boolean, reason: string): void { if (!ok) throw new Error('animation proof: ' + reason); }
interface Reference { Walk: number[][]; Run: number[][]; }
interface SocketReference { translation: number[]; joint: string; }
interface SocketMetadata { sockets: SocketReference[]; }
export function prove(model: SkinnedModel, events: AnimationEvent[]): void {
  check(model.vertices > 100 && model.jointCount > 8, 'not a skinned character');
  const rest = model.positions.slice();
  const walk = model.clips.indexOf('Walk'), run = model.clips.indexOf('Run');
  check(walk >= 0 && run >= 0, 'named clips missing');
  model.sample(walk, .25);
  let moved: i32 = 0;
  for (let i = 0; i < rest.length; i++) if (Math.abs(rest[i] - model.positions[i]) > .005) moved++;
  check(moved > 100, 'skin did not deform');
  const reference: Reference = JSON.parse(readText('companion.reference.json'));
  let maxError = 0;
  for (const name of ['Walk', 'Run']) {
    model.sample(model.clips.indexOf(name), name === 'Walk' ? .25 : 1 / 6);
    const expected = name === 'Walk' ? reference.Walk : reference.Run;
    for (let i = 0; i < model.vertices; i++) {
      let best = 1000000;
      const x = model.positions[i*3], y = model.positions[i*3+1], z = model.positions[i*3+2];
      for (const v of expected) { const dx=x-v[0], dy=y-v[1], dz=z-v[2]; best=Math.min(best, dx*dx+dy*dy+dz*dz); }
      maxError = Math.max(maxError, Math.sqrt(best));
    }
  }
  check(maxError < .005, 'Blender reference deviation ' + maxError);
  const player = new AnimationPlayer(model, events);
  let emitted: i32 = 0;
  player.onEvent = (name: string): void => { emitted++; };
  player.play('Walk', 0); player.seek(0); player.step(2.1);
  check(emitted === 4, 'loop events must cross every interval exactly once');
  player.seek(.8); check(emitted === 4, 'seek emitted gameplay events');
  player.paused = true; const paused = player.time; player.update(.5); check(player.time === paused, 'pause advanced');
  player.step(.1); check(player.time > paused && emitted === 4, 'single step failed');
  player.loop = false; player.seek(.9); player.step(1); check(player.time === 1, 'nonloop end');
  const beforeEnd = emitted; player.step(1); check(emitted === beforeEnd, 'nonloop repeated event');
  player.play('Run', .4); player.step(.2); check(Math.abs(player.blend-.5)<.001, 'blend weight');
  const socket: number[] = [1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
  check(model.joint('Head', socket) && Number.isFinite(socket[12]), 'head attachment socket');
  model.sample(-1,0); check(model.joint('Head',socket),'rest socket');
  const socketMetadata: SocketMetadata = JSON.parse(readText('companion.animation.json'));
  const offset=socketMetadata.sockets[0].translation;
  const mouthY=socket[1]*offset[0]+socket[5]*offset[1]+socket[9]*offset[2]+socket[13];
  const mouthZ=socket[2]*offset[0]+socket[6]*offset[1]+socket[10]*offset[2]+socket[14];
  check(Math.abs(mouthY-.96)<.005 && Math.abs(mouthZ+1.12)<.005,'mouth source transform');
  const replacement = new SkinnedModel('companion.glb');
  player.seek(.2); const phase = player.time/model.durations[player.clip];
  check(player.replace(replacement), 'same skeleton compatibility');
  check(Math.abs(player.time/replacement.durations[player.clip]-phase)<.00001, 'replacement normalized phase');
  replacement.dispose(); replacement.dispose();
  const bad = env('ANIMATION_BAD_DIR');
  if (bad.length>0) {
    for (const kind of ['weights','joints']) {
      let rejected=false;
      try { const invalid=new SkinnedModel(bad+'/'+kind+'.glb'); invalid.dispose(); }
      catch(e) { rejected=(e as Error).message.includes(kind === 'weights' ? 'weights' : 'joint index'); }
      check(rejected,'invalid '+kind+' accepted');
    }
  }
  console.log(`animation proof: ${model.vertices} vertices, ${model.jointCount} joints, ${moved} deformed coordinates, Blender error ${maxError.toFixed(6)} m; loops/seek/pause/step/blend/socket passed`);
}
