# secure-store plugin (`zinc:secure-store`)

Secrets (a login token, an API key) in the system keychain, with the API of Expo's
[`expo-secure-store`](https://docs.expo.dev/versions/latest/sdk/securestore/): `import * as SecureStore from 'expo-secure-store'` works
unchanged. Use it for what must not sit in a plain file; `zinc:storage` and AsyncStorage stay the place for settings.

```ts
import * as SecureStore from 'expo-secure-store';     // or 'zinc:secure-store'

if (await SecureStore.isAvailableAsync()) {
  await SecureStore.setItemAsync('token', token);
  const t = await SecureStore.getItemAsync('token');  // null when there is none
  await SecureStore.deleteItemAsync('token');
}
```

- `getItemAsync(key, options?)`: the value, or `null` when there is none. `setItemAsync(key, value, options?)` creates or replaces it.
  `deleteItemAsync(key, options?)` removes it (nothing when there is none). `getItem` and `setItem` are the synchronous forms.
- Keys are as Expo's: not empty, only letters, digits, `.`, `-` and `_`; any other key rejects. Values are strings (JSON-encode the rest).
- `options.keychainService`: the service the item lives under. By default it is the app id of `zinc.json` (`app.id`); a bare script
  uses `zinc.secure-store`. An item set with a service is read with the same one.
- `requireAuthentication: true` rejects: the desktop Keychain does not ask for biometrics here yet, and storing without the authentication
  asked for would be wrong. `canUseBiometricAuthentication()` is false. `keychainAccessible` (with its constants `WHEN_UNLOCKED`...) and
  `accessGroup` are iOS options in Expo and are ignored.

**Where the secrets live.** macOS: generic passwords of the login Keychain (Security.framework; Keychain Access shows them under the
service name). A target with no keychain backend (Linux and Windows today) answers `false` to `isAvailableAsync()` and every other call
rejects with `zinc:secure-store: this target has no system keychain`: a secret is never written to a plain file.

macOS ties a Keychain item to the program that created it: an unsigned program rebuilt since (a new `zinc` binary, a new AOT build) may
make macOS ask once whether it can read the item. A signed app keeps its access across updates.

**Test.** `tests/t0/secure_store.sh` round-trips a value on the interpreter, AOT and QuickJS under a test service and deletes it.
