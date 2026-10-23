// display-gl captures its last frame; drive the real scene to a fixed optical state.
import { onFrame } from 'zinc:gfx';
import { env } from 'zinc:sys';
import { Stage, uiState } from 'zinc:stage';
import { state } from '../../../examples/glass-icon-reveal/src/state';
import { Reveal } from '../../../examples/glass-icon-reveal/src/components/Reveal';

state.seek(0.65);
state.dark = env('GLASS_DARK') === '1';
const stage = new Stage();
stage.color = state.dark ? 0x080a10 : 0xe9e9eb;
stage.alignItems = 'stretch';
const reveal = new Reveal('reveal');
reveal.flex = 1;
stage.addChild(reveal);
let frame = 0;
onFrame((dt: number) => {
  // The display reports shader support after its first presentation.
  if (++frame <= 3) uiState.dirty = true;
  stage.frame(dt);
});
