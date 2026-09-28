// Entry of the text demo, Solid model (main-react.tsx shows the same screen with the React engine).
import { render } from 'zinc:ui/solid';
import { Screen, tickFrames } from './solid';

render(Screen, 0xfafafa, (dt: number) => { tickFrames(); });
