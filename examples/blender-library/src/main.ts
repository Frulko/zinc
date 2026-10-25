import { onFrame, width, height } from 'zinc:gfx';
import { args } from 'zinc:sys';
import { Stage } from 'zinc:stage';
import { LibraryState } from './state';
import { LibraryView } from './view';

const model = new LibraryState();
if (args().includes('--proof')) model.proof();
const stage = new Stage(), view = new LibraryView(model);
stage.addChild(view);
let frames: i32 = 0;
onFrame((dt: number) => { view.width = width(); view.height = height(); stage.frame(dt); if (++frames === 300) console.log(`idle frames 300 draws ${view.draws}`); });
