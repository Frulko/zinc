// Implementation for the sim target (NAT-12): same behaviour as the C++ one.
let t = 21.5;
export default {
  temperature(): number { t += 0.25; return t; },
  serial(): string { return 'HOST-0001'; },
  setLed(_on: boolean): void {},
};
