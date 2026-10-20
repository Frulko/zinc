// The page of pixi-text.js (ZN-570): PixiJS 8 as a module, then the application as a classic script. Run by tests/t1/webenv_canvas2d_libs.sh.
import * as PIXI from 'pixi.js';
globalThis.PIXI = PIXI;
(0, eval)(await (await fetch('pixi-text.js')).text());
