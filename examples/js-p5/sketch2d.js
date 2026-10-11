// A p5.js sketch in the default 2D mode: a ring of dots turns around the pointer, and a line of text says where it is.
// Move the pointer; press it and the ring opens wider.
const DOTS = 16;

function setup() {
  createCanvas(windowWidth, windowHeight);
  colorMode(HSB);
  noStroke();
  textFont('sans-serif');
  textSize(18);
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}

function draw() {
  background(230, 70, 15);
  const radius = mouseIsPressed ? 110 : 60;
  for (let i = 0; i < DOTS; i++) {
    const angle = TWO_PI * i / DOTS + frameCount * 0.03;
    fill(360 * i / DOTS, 60, 100);
    circle(mouseX + radius * cos(angle), mouseY + radius * sin(angle), 14 + 6 * sin(angle * 3 + frameCount * 0.1));
  }
  fill(0, 0, 100);
  textAlign(CENTER);
  text('pointer at ' + round(mouseX) + ', ' + round(mouseY), mouseX, mouseY + radius + 40);
  textAlign(LEFT);
  text('p5.js, 2D mode', 12, 28);
}
