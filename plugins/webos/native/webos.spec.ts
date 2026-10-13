// Native side of zinc:webos: the PDK's libpdl, loaded from the device when it is there. One implementation, webos.host.cpp; off webOS (and
// in webos.sim.ts) nothing is available and every call answers false.
import { NativeModule, requireNative } from 'zinc:native';

export interface Spec extends NativeModule {
  /** True on webOS: libpdl.so is there. */
  available(): boolean;
  /** Calls a service of the Luna bus with JSON parameters, without waiting for its answer. False when the call could not be sent. */
  call(uri: string, params: string): boolean;
  /** Why the last call() answered false ('' after a call that was sent). */
  error(): string;
}
export default requireNative<Spec>('Webos');
