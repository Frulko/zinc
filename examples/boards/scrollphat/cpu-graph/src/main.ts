// cpu-graph: a scrolling bar graph of the Pi's CPU usage on the Scroll pHAT (one column per half second, newest on
// the right, 5 LEDs = 100 %). Every few seconds it switches to memory usage; a letter (C / M) announces the graph.
// On the Mac the numbers are simulated (no /proc). Space switches the graph by hand.
import { onFrame, clear, rect, width, height, wasPressed, Btn } from 'zinc:gfx';
import { drawText, FONT_3X5 } from 'zinc:pixelfont';
import { cpuUsage, memUsage, simulated } from './stats';

const SAMPLE_EVERY = 0.5;  // seconds per column
const CPU_TIME = 10, MEM_TIME = 5, LABEL_TIME = 1;

const W = width(), H = height();
const cpu: number[] = [], mem: number[] = [];
for (let i: i32 = 0; i < W; i++) { cpu.push(0); mem.push(0); }
let showMem = false, modeTime = 0, sampleIn = 0;

console.log(`cpu-graph: ${simulated() ? 'simulated numbers (no /proc)' : 'reading /proc/stat and /proc/meminfo'}`);
cpuUsage();  // the first call only sets the baseline

function push(list: number[], v: number): void {
  list.shift();
  list.push(v);
}

onFrame((dt: number) => {
  sampleIn -= dt;
  if (sampleIn <= 0) {
    sampleIn = SAMPLE_EVERY;
    push(cpu, cpuUsage());
    push(mem, memUsage());
  }
  modeTime += dt;
  if (wasPressed(Btn.A) || modeTime >= (showMem ? MEM_TIME : CPU_TIME)) { showMem = !showMem; modeTime = 0; }

  clear(0x000000);
  if (modeTime < LABEL_TIME) {
    drawText(Math.floor((W - 3) / 2), 0, showMem ? 'M' : 'C', 0xffffff, FONT_3X5, 0, W);
    return;
  }
  const list = showMem ? mem : cpu;
  for (let x: i32 = 0; x < W; x++) {
    // round up so any load lights at least one LED
    const n: i32 = Math.min(H, Math.ceil(list[x] * H - 0.05));
    if (n > 0) rect(x, H - n, 1, n, 0xffffff);
  }
});
