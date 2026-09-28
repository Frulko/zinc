// zinc:mapping native side: the layer state and the GL compositor (mapping.host.cpp).
import { NativeModule, requireNative } from 'zinc:native';

export interface Spec extends NativeModule {
  /** One command of the address space (docs/plugins/mapping.md); false when unknown or malformed. */
  command(address: string, numbers: f64[], strings: string[]): boolean;
  /** Whole setup: {"version":1,"layers":[{key: [args...]}]} where each key is a /layer/<n>/<key> command. */
  toJson(): string;
  /** Replaces the setup; false (state untouched) when the JSON is malformed. */
  fromJson(json: string): boolean;
  /** One layer, same shape as in toJson (OSC state replies stay small). */
  layerJson(layer: i32): string;
  /** {"layers":n,"selected":i,"aspect":w/h} */
  info(): string;
  layerCount(): i32;
}
export default requireNative<Spec>('Mapping');
