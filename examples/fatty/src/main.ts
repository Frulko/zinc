import { onFrame } from 'zinc:gfx';
import { Stage } from 'zinc:stage';
import { Main } from './fatOutFood/Main';

const stage = new Stage();
const main = new Main();
stage.addChild(main);
onFrame((dt: number) => main.frame(dt));
