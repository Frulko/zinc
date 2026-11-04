import '../../../examples/pixel-plays/src/harbor/main.js';
import { game, throwParcel, PARCELS } from '../../../examples/pixel-plays/src/harbor/state.js';
import { scene } from '../../../examples/pixel-plays/src/view.js';
const context=scene.getContext('2d');
const originalPut=context.putImageData.bind(context);
let draws=0;
context.putImageData=(...args)=>{ draws++; return originalPut(...args); };
let frame=0,pausedTime=0,pausedDraws=0;
function assert(ok,message) {
  if (!ok) throw new Error('harbor frame '+frame+': '+message);
}
function inspect() {
  if (frame===22) assert(game.phase==='aim'&&game.remaining===PARCELS,'Space did not start the round');
  if (frame===32) {
    assert(game.remaining===PARCELS-1,'keyboard did not throw');
    assert(!throwParcel(),'a second parcel flew with the first');
    console.log('last-boat: keyboard and cooldown PASS');
  }
  if (frame===85) {
    assert(game.paused,'pause key ignored');
    pausedTime=game.time;
    pausedDraws=draws;
    assert(!throwParcel(),'paused throw started');
  }
  if (frame===390) {
    assert(game.time===pausedTime,'paused scene advanced');
    assert(draws===pausedDraws,'paused scene was redrawn');
    console.log('last-boat: 300 frozen frames PASS');
  }
  if (frame===420) assert(!game.paused&&game.time>pausedTime,'resume ignored');
  if (frame===556) {   // the throw leaves on the release, at 553
    assert(game.remaining===PARCELS-2,'mouse did not throw');
    console.log('last-boat: mouse PASS');
  }
  if (frame===756) {
    assert(game.remaining===PARCELS-3,'touch did not throw');
    console.log('last-boat: touch PASS');
  }
  frame++;
  requestAnimationFrame(inspect);
}
requestAnimationFrame(inspect);
