// zinc:device on the sim target: no backlight, no chip; fixed figures so the output stays deterministic.
export default {
  setBacklight(_level: number): boolean { return false; },
  hasTouch(): boolean { return true; },
  heapFree(): number { return -1; },
  heapMinFree(): number { return -1; },
  zincHeapUsed(): number { return 0; },
  zincHeapSize(): number { return 0; },
  frameUs(): number { return 0; },
  drawCmds(): number { return 0; },
  cpuMhz(): number { return 0; },
  chip(): string { return 'sim'; },
};
