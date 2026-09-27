import { render } from 'zinc:ui/solid';
import { Screen, tickFrames } from './solid';
render(Screen, 0x000000, (dt: number) => { tickFrames(); });
