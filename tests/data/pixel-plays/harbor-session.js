import '../../../examples/pixel-plays/src/harbor/main.js';
import { study,triggerThrow } from '../../../examples/pixel-plays/src/harbor/state.js';
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
  if (frame===22) {
    assert(study.throws===1,'keyboard did not rehearse');
    assert(!triggerThrow(),'rehearsal cooldown ignored');
    console.log('last-boat: keyboard and cooldown PASS');
  }
  if (frame===85) {
    assert(study.paused,'pause key ignored');
    pausedTime=study.time;
    pausedDraws=draws;
    assert(!triggerThrow(),'paused rehearsal started');
  }
  if (frame===390) {
    assert(study.time===pausedTime,'paused scene advanced');
    assert(draws===pausedDraws,'paused scene was redrawn');
    console.log('last-boat: 300 frozen frames PASS');
  }
  if (frame===420) assert(!study.paused&&study.time>pausedTime,'resume ignored');
  if (frame===552) {
    assert(study.throws===2,'mouse did not rehearse');
    console.log('last-boat: mouse PASS');
  }
  if (frame===752) {
    assert(study.throws===3,'touch did not rehearse');
    console.log('last-boat: touch PASS');
  }
  frame++;
  requestAnimationFrame(inspect);
}
requestAnimationFrame(inspect);
