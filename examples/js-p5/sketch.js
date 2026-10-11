// A wave of boxes, a p5.js sketch in WEBGL mode: move the pointer left and right to turn the wave, up and down to tilt it.
const COUNT = 12;   // boxes along each side

function setup() {
  createCanvas(windowWidth, windowHeight, WEBGL);
  colorMode(HSB);
  noStroke();
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}

function draw() {
  background(230, 70, 15);
  ambientLight(0, 0, 45);
  directionalLight(0, 0, 100, -0.4, 0.6, -1);

  rotateX(map(mouseY, 0, height, 1.3, 0.5));      // the pointer tilts the wave
  rotateZ(map(mouseX, 0, width, -PI / 2, PI / 2));   // and turns it

  const side = min(width, height) / 18;
  for (let i = 0; i < COUNT; i++) {
    for (let j = 0; j < COUNT; j++) {
      const x = (i - (COUNT - 1) / 2) * side, y = (j - (COUNT - 1) / 2) * side;
      const wave = sin(dist(x, y, 0, 0) / side * 0.8 - frameCount * 0.06);   // -1 to 1, a ring that moves out from the centre
      const tall = side * (2 + 1.5 * wave);
      push();
      translate(x, y, tall / 2);
      fill(200 + 80 * wave, 70, 100);   // from green to pink with the height
      box(side * 0.8, side * 0.8, tall);
      pop();
    }
  }
}
