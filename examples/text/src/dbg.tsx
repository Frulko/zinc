import { render } from 'zinc:ui/react';
import { Screen, tickFrames } from './react';
let n: i32 = 0;
queueMicrotask(() => console.log('boot microtask'));
render(Screen, 0xfafafa, (dt: number) => { n++; console.log('tick', n); tickFrames(); queueMicrotask(() => console.log('micro after tick', n)); });
