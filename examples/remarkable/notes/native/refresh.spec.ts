import { NativeModule, requireNative } from 'zinc:native';
export interface Spec extends NativeModule {
  /** Explicit switch; false if a previous switch is still settling or the connection failed. */
  setFast(fast: boolean): boolean;
  mode(): i32;
  busy(): boolean;
}
export default requireNative<Spec>('RmppRefresh');
