const canvas=document.createElement('canvas');
canvas.width=2;
canvas.height=2;
canvas.style.width='64px';
canvas.style.height='64px';
canvas.style.imageRendering='pixelated';
document.body.appendChild(canvas);
const context=canvas.getContext('2d');
const pixels=context.createImageData(2,2);
pixels.data.set([255,0,0,255, 0,255,0,255, 0,0,255,255, 255,255,255,255]);
context.putImageData(pixels,0,0);
let frame=0;
function run() {
  frame++;
  if (frame===3) canvas.style.imageRendering='auto';
  if (frame===5) canvas.style.imageRendering='crisp-edges';
  requestAnimationFrame(run);
}
requestAnimationFrame(run);
