// The plugin's check: every call of the API against a fresh store (ZINC_STORAGE names a temporary file).
import AsyncStorage from '@react-native-async-storage/async-storage';

async function main(): Promise<void> {
  await AsyncStorage.clear();
  console.log(await AsyncStorage.getItem('missing'));
  await AsyncStorage.setItem('empty', '');
  console.log(JSON.stringify(await AsyncStorage.getItem('empty')));
  await AsyncStorage.setItem('user', JSON.stringify({ name: 'Ada', prefs: { theme: 'dark', size: 2 }, tags: ['a'] }));
  await AsyncStorage.mergeItem('user', JSON.stringify({ prefs: { size: 3 }, tags: ['b'] }));
  console.log(await AsyncStorage.getItem('user'));
  await AsyncStorage.multiSet([['k1', 'v1'], ['k2', 'v2']]);
  console.log(JSON.stringify(await AsyncStorage.multiGet(['k1', 'k2', 'k3'])));
  await AsyncStorage.multiRemove(['k1']);
  console.log((await AsyncStorage.getAllKeys()).join(','));
  await AsyncStorage.removeItem('user');
  await AsyncStorage.clear();
  console.log((await AsyncStorage.getAllKeys()).length);
}
main();
