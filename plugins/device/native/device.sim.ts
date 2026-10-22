// zinc:device on the sim target: no backlight, no chip; fixed figures so the output stays deterministic.
export default {
  setBacklight(_level: number): boolean { return false; },
  hasTouch(): boolean { return true; },
  touchMap(i: number): number { return i === 0 || i === 4 ? 1 : 0; },
  setTouchMap(_a: number, _b: number, _c: number, _d: number, _e: number, _f: number): boolean { return false; },
  heapFree(): number { return -1; },
  heapMinFree(): number { return -1; },
  zincHeapUsed(): number { return 0; },
  zincHeapSize(): number { return 0; },
  frameUs(): number { return 0; },
  drawCmds(): number { return 0; },
  cpuMhz(): number { return 0; },
  chip(): string { return 'sim'; },
  flashSize(): number { return -1; },
  idfVersion(): string { return ''; },
  firmware(): string { return ''; },
};
