import { NativeModule, requireNative } from 'zinc:native';
export interface Spec extends NativeModule {
  start(): void;
  poll(): void;
  has(): boolean;
  info(): string;
  scan(): boolean;
  busy(): boolean;
  networks(): string;
  connect(ssid: u8[], password: string, accessPoint: boolean): boolean;
  disconnect(): void;
  stop(): void;
  error(): string;
}
export default requireNative<Spec>('Wifi');
