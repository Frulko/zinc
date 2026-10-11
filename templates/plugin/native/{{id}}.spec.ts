// The native part of zinc:{{id}}: this interface is the whole contract. zinc generates the C++ class Native{{ident}} from it
// (zinc_native_{{ident}}.h); native/{{id}}.host.cpp implements it for macOS and Linux, native/{{id}}.sim.ts in Zinc where no native code runs.
import { NativeModule, requireNative } from 'zinc:native';

export interface Spec extends NativeModule {
  /** 32-bit FNV-1a of the UTF-8 bytes of the text. */
  fnv1a(text: string): i32;
}
export default requireNative<Spec>('{{ident}}');
