// Simulated machine state (the port of flipctl's status.rs sysfs reader comes with a Linux plugin).
export class Status {
  battery: i32 = 87;
  charging: boolean = false;
  wifi: boolean = true;
  wifiQuality: i32 = 72;
  ethernet: i32 = 1;       // 0 down, 1 real, 2 usb gadget
  recording: boolean = false;
  modem: boolean = true;
  tech: string = '5G';
  modemQuality: i32 = 60;
  batteryTemp: i32 = 312;  // tenths of a degree
  cpuTemp: i32 = 552;
  powerMw: i32 = -2340;
  hostname: string = 'flipper';
  profile: string = 'Default';
}
export const status = new Status();
