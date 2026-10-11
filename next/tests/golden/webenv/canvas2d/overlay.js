// A 2D canvas over a WebGL canvas, as a game's overlay is (LittleJS's text canvas, a HUD): where the 2D canvas is transparent the WebGL
// canvas shows, where it is half transparent the two mix (ZN-570). Flat colours only: the window's frame 2 is overlay-2.png on every GPU.
// Run with ZINC_WEB=1 ZINC_DETERMINISTIC=1 ZINC_SCALE=1 ZINC_FRAMES=3 by tests/t1/webenv_canvas2d.sh.
const under = document.createElement('canvas'); under.width = 320; under.height = 240;
const over = document.createElement('canvas'); over.width = 320; over.height = 240;
document.body.append(under, over);
const gl = under.getContext('webgl', { antialias: false, alpha: false });
const ctx = over.getContext('2d');
ctx.fillStyle = '#ff0000'; ctx.fillRect(20, 20, 100, 60);
ctx.fillStyle = 'rgba(0, 0, 255, 0.5)'; ctx.fillRect(160, 120, 120, 80);
requestAnimationFrame(function frame() { gl.clearColor(0, 1, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT); requestAnimationFrame(frame); });
