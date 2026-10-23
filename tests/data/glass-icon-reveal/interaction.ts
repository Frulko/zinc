import * as assert from 'zinc:assert';
import { onFrame } from 'zinc:gfx';
import { Stage } from 'zinc:stage';
import { Reveal } from '../../../examples/glass-icon-reveal/src/components/Reveal';
import { state } from '../../../examples/glass-icon-reveal/src/state';

const stage = new Stage();
stage.alignItems = 'stretch';
const reveal = new Reveal('reveal');
reveal.flex = 1;
stage.addChild(reveal);
let frame = 0;
onFrame((dt: number) => {
  frame++;
  state.step(dt);
  stage.frame(dt);
  if (frame === 55) {
    assert.equal(state.playing, false, 'mouse scrub pauses');
    assert.ok(state.time > 1.4, 'mouse scrub advances the timeline');
  }
  if (frame === 64) {
    assert.equal(state.playing, true, 'Replay button resumes');
    assert.ok(state.time < 0.1, 'Replay button rewinds');
  }
  if (frame === 102) {
    assert.equal(state.playing, true, 'touch tap replays');
    assert.ok(state.time < 0.1, 'touch tap rewinds');
  }
  if (frame === 113) {
    assert.equal(state.playing, false, 'Pause button stops playback');
    assert.equal(state.dark, true, 'Dark button works while paused');
  }
});
