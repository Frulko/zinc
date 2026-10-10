// A p5 sketch in global mode, as the p5 editor writes it: an orange box turning in WEBGL mode. The pixels read are inside the box's flat
// colour and in the background's corner, so every GPU gives the same numbers.
function setup() {
  createCanvas(320, 240, WEBGL);
  console.log('setup', width, height, drawingContext instanceof WebGL2RenderingContext, document.querySelector('canvas') === drawingContext.canvas, document.querySelector('main') !== null);
}
function draw() {
  background(20, 40, 60);
  rotateY(frameCount * 0.05);
  rotateX(0.4);
  noStroke();
  fill(255, 120, 0);
  box(90);
  if (frameCount === 1 || frameCount === 5) {
    const gl = drawingContext, centre = new Uint8Array(4), corner = new Uint8Array(4);
    gl.readPixels(gl.drawingBufferWidth >> 1, gl.drawingBufferHeight >> 1, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, centre);
    gl.readPixels(2, 2, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, corner);
    console.log('frame', frameCount, 'centre', centre.join(','), 'corner', corner.join(','), 'error', gl.getError());
  }
}
