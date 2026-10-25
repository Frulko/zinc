import { onFrame, width, height } from 'zinc:gfx';
import { args } from 'zinc:sys';
import { Stage } from 'zinc:stage';
import { LabState } from './state';
import { LabView } from './view';
import { prove } from './proof';
import { gpu } from 'zinc:3d';
const state = new LabState();
console.log(`animation renderer: ${gpu() ? 'GPU' : 'CPU'}`);
if (args().includes('--proof')) { prove(state.model,state.events); state.player.seek(.25); state.player.paused=true; }
const stage = new Stage(), view = new LabView(state);
stage.addChild(view);
onFrame((dt: number) => { view.width=width(); view.height=height(); stage.frame(dt); });
