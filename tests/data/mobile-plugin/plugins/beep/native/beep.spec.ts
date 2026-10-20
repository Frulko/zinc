// The fixture plugin of tests/t0/export_android.sh, export_ios.sh and native_gen.sh (ZN-628): phone entries with every key of docs/plugins.md
// "Phones", and the spec of a Java class (Android) and a Swift class (iOS) behind generated glue.
import { NativeModule, requireNative } from 'zinc:native';

export interface Spec extends NativeModule {
  ping(): i32;
  greet(name: string, loud: boolean): string;
  /** Calls `cb` twice, later: from another thread on Android, from the main queue on iOS. */
  watch(cb: (n: i32, label: string) => void): void;
}
export default requireNative<Spec>('Beep');
