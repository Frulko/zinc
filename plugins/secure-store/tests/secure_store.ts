// zinc:secure-store round trip through the keychain under a test service (tests/t0/secure_store.sh), imported by Expo's name.
import * as SecureStore from 'expo-secure-store';
import * as sys from 'zinc:sys';

async function main(): Promise<void> {
  const opts: SecureStore.SecureStoreOptions = { keychainService: sys.args()[0] };
  console.log(await SecureStore.isAvailableAsync());
  console.log(await SecureStore.getItemAsync('token', opts));
  await SecureStore.setItemAsync('token', 'first', opts);
  await SecureStore.setItemAsync('token', 'sécret ✓', opts);
  console.log(await SecureStore.getItemAsync('token', opts));
  await SecureStore.setItemAsync('empty', '', opts);
  console.log(JSON.stringify(await SecureStore.getItemAsync('empty', opts)));
  await SecureStore.deleteItemAsync('token', opts);
  await SecureStore.deleteItemAsync('empty', opts);
  await SecureStore.deleteItemAsync('token', opts);
  console.log(await SecureStore.getItemAsync('token', opts));
  try { await SecureStore.getItemAsync('bad key', opts); } catch (e) { console.log('rejected: ' + (e as Error).message.slice(0, 25)); }
}
main();
