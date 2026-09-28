// zinc:imu on the sim target: no sensor, like macOS (index.ts emulates it).
export default {
  open(): boolean { return false; },
  read(): boolean { return false; },
  value(_i: number): number { return 0; },
};
