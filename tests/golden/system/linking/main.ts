// React Native's Linking (zinc:react-native/linking, ZN-367.04) over the system plugin's recording simulator: openURL reaches the opener, a URL outside the
// opener scope is refused, canOpenURL, getInitialURL, and a deep link reaches the 'url' listener.
import * as system from 'zinc:system';
import { Linking, LinkingEvent } from 'zinc:react-native/linking';

async function main(): Promise<void> {
  await Linking.openURL('https://reactnative.dev');
  await Linking.openURL('tel:+33123456789');
  try { await Linking.openURL('ftp://example.com'); console.log('ftp: allowed'); } catch (e) { console.log('ftp:', e.message); }
  console.log('can open', await Linking.canOpenURL('https://example.com'));
  console.log('initial', JSON.stringify(await Linking.getInitialURL()));
  console.log('last', JSON.stringify(system.call('opener.last', {})));
  const sub = Linking.addEventListener('url', (e: LinkingEvent) => { console.log('url event', e.url); sub.remove(); system.quit(0); });
}
main();
