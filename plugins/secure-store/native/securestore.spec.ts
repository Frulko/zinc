// Native side of zinc:secure-store: generic passwords of the system keychain (securestore.abi.c: Security.framework on macOS; elsewhere
// available() is false and every other call fails).
import { NativeModule, requireNative } from 'zinc:native';

export interface Spec extends NativeModule {
  /** Whether this target has a keychain. */
  available(): boolean;
  /** The secret of (service, key): '' when there is none, else '=' followed by the value (an empty value is not a missing one). */
  get(service: string, key: string): string;
  /** Creates or replaces the secret of (service, key). */
  set(service: string, key: string, value: string): void;
  /** Removes the secret of (service, key); nothing when there is none. */
  remove(service: string, key: string): void;
}
export default requireNative<Spec>('SecureStore');
