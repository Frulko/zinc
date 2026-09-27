import { render } from 'zinc:ui/react';
import { Screen, tickFrames } from './react';
render(Screen, 0x000000, (dt: number) => { tickFrames(); });
