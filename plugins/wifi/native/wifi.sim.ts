// No simulated access point is presented as an observed radio.
export default {
  start: (): void => {}, poll: (): void => {}, has: (): boolean => false,
  info: (): string => 'unsupported\t\t\t0', scan: (): boolean => false,
  busy: (): boolean => false, networks: (): string => '',
  connect: (ssid: u8[], password: string, accessPoint: boolean): boolean => false,
  disconnect: (): void => {}, stop: (): void => {}, error: (): string => 'Wi-Fi requires NetworkManager on Linux',
};
