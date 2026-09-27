// zinc:gfx for the sim target: headless (draw calls are no-ops), 320x240, no input.
import { $z } from './zinc.mjs';

export const onFrame = cb => { $z.state.frameCb = cb; };
export const width = () => 320;
export const height = () => 240;
export const clear = () => {};
export const rect = () => {};
export const line = () => {};
export const text = () => {};
export const isDown = () => false;
export const wasPressed = () => false;
export const pointerX = () => 0;
export const pointerY = () => 0;
export const pointerDown = () => false;
export const frame = () => $z.state.frame;
export const quit = () => { $z.state.quit = true; };
