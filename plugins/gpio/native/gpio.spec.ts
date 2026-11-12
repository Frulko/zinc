import { NativeModule, requireNative } from 'zinc:native';
export interface Spec extends NativeModule {
  setup(pin: i32, mode: string, pull: string, drive: string, initial: i32): boolean;
  select(pin: i32, chip: string, line: string): boolean;
  write(pin: i32, value: i32): boolean;
  read(pin: i32): i32;
  watch(pin: i32, edge: string, debounceMs: i32): i32;
  release(pin: i32): void;
  simulate(pin: i32, value: i32): boolean;
  poll(pin: i32, generation: i32): f64[];
  simulated(pin: i32): boolean;
  error(): string;
}
export default requireNative<Spec>('GPIO');
