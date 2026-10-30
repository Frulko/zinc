// zinc:secure-store — secrets in the system keychain with Expo's API (expo-secure-store; docs/plugins/secure-store.md).
// `import * as SecureStore from 'expo-secure-store'` works unchanged. macOS: generic passwords of the Keychain, service = the app id of
// zinc.json (`keychainService` overrides it). A target with no keychain answers false to isAvailableAsync and every other call rejects:
// a secret is never written to a plain file.
import N from './native/securestore.spec';
import { APP } from 'zinc:system/app';

/** The service of a bare script (no zinc.json app id). */
const DEFAULT_SERVICE = 'zinc.secure-store';

export interface SecureStoreOptions {
  /** The keychain service the item lives under (the app id by default); an item set with it is read with it. */
  keychainService?: string;
  /** Not supported on the desktop Keychain yet: the call rejects rather than store without the authentication asked for. */
  requireAuthentication?: boolean;
  requireConfirmation?: boolean;
  authenticationPrompt?: string;
  /** iOS only in Expo; ignored here. */
  keychainAccessible?: number;
  /** iOS only in Expo; ignored here. */
  accessGroup?: string;
}

// Expo's accessibility constants (iOS's kSecAttrAccessible), so code that passes them compiles; the macOS login keychain ignores them.
export const AFTER_FIRST_UNLOCK: number = 0;
export const AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: number = 1;
export const ALWAYS: number = 2;
export const WHEN_PASSCODE_SET_THIS_DEVICE_ONLY: number = 3;
export const ALWAYS_THIS_DEVICE_ONLY: number = 4;
export const WHEN_UNLOCKED: number = 5;
export const WHEN_UNLOCKED_THIS_DEVICE_ONLY: number = 6;

function appService(): string {
  const at = APP.indexOf('"id":"');
  if (at < 0) return DEFAULT_SERVICE;
  const from = at + 6;
  const id = APP.slice(from, APP.indexOf('"', from));
  return id === '' ? DEFAULT_SERVICE : id;
}

function service(options?: SecureStoreOptions): string {
  if (options !== undefined && options.requireAuthentication === true)
    throw new Error('zinc:secure-store: requireAuthentication is not supported on this target yet');
  return options !== undefined && options.keychainService !== undefined && options.keychainService !== '' ? options.keychainService : appService();
}

function checkKey(key: string): void {
  if (!/^[\w.-]+$/.test(key))
    throw new Error('Invalid key provided to SecureStore. Keys must not be empty and contain only alphanumeric characters, ".", "-", and "_".');
}

/** Whether this target has a keychain to keep secrets in. */
export async function isAvailableAsync(): Promise<boolean> { return N.available(); }

/** The value stored for `key`, or null when there is none. */
export function getItem(key: string, options?: SecureStoreOptions): string | null {
  checkKey(key);
  const v = N.get(service(options), key);
  return v === '' ? null : v.slice(1);
}

/** Stores `value` for `key`, replacing any older value. */
export function setItem(key: string, value: string, options?: SecureStoreOptions): void {
  checkKey(key);
  N.set(service(options), key, value);
}

export async function getItemAsync(key: string, options?: SecureStoreOptions): Promise<string | null> { return getItem(key, options); }
export async function setItemAsync(key: string, value: string, options?: SecureStoreOptions): Promise<void> { setItem(key, value, options); }

/** Removes the value of `key`; nothing happens when there is none. */
export async function deleteItemAsync(key: string, options?: SecureStoreOptions): Promise<void> {
  checkKey(key);
  N.remove(service(options), key);
}

/** No biometric prompt on the desktop Keychain yet. */
export function canUseBiometricAuthentication(): boolean { return false; }
