// Entry of the text demo, React model (main-solid.tsx shows the same screen with Solid signals).
import { render } from 'zinc:ui/react';
import { Screen, tickFrames } from './react';

render(Screen, 0xfafafa, (dt: number) => { tickFrames(); });
