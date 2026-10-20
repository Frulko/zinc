// A p5.js sketch in its default 2D mode, as the p5 editor writes it (ZN-570): a classic script, the same in the web environment (p5.js) and
// in headless Chrome (tools/canvas2d-ref, where FAMILY names the bundled Inter). p5 draws everything with the canvas's 2D context.
function setup() {
  createCanvas(320, 240);
  pixelDensity(1);
  textFont(globalThis.FAMILY || 'sans-serif');
}
function draw() {
  background(24, 32, 48);
  noStroke(); fill(255, 80, 80); rect(20, 20, 80, 50);
  fill(80, 200, 120, 160); ellipse(120, 60, 90, 60);
  stroke(255); strokeWeight(3); line(20, 100, 300, 120);
  noFill(); stroke(255, 210, 74); triangle(200, 20, 300, 20, 250, 80);
  push(); translate(250, 150); rotate(0.4); fill(120, 160, 255); noStroke(); rect(-25, -15, 50, 30, 8); pop();
  noStroke(); fill(255); textSize(28); textAlign(LEFT, BASELINE); text('p5.js in 2D', 20, 170);
  textSize(14); textAlign(CENTER, CENTER); text('centred text', 160, 210);
}
