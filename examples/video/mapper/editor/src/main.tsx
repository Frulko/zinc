// The mapper's editor, one program for a page the mapper serves and for a native client on any machine.
// A page connects to where it came from; a native client takes `--app <address>` or asks for it, then remembers it.
import { createSignal, render } from 'zinc:ui/solid';
import { current } from 'zinc:system/deeplink';
import * as storage from 'zinc:storage';
import { DARK, setTheme } from 'zinc:ui/kit';
import { args, platform } from 'zinc:sys';
import { ConnectScreen } from './components/ConnectScreen';
import { EditorScreen } from './components/EditorScreen';
import { ADDRESS_KEY, BACKGROUND } from './constants';
import { connect, startSending } from './services/link';
import { onFileDropped } from './services/files';
import { connected, loadMedia, loadShow, loadState, setStatus } from './state';
import { sendFiles } from './transfers';

function givenAddress(): string {
  if (platform() === 'web') {
    const page = current()[0];
    if (page.includes('?token=') || !storage.keys().includes(ADDRESS_KEY)) return page;
    return storage.get(ADDRESS_KEY);   // paired with a code: the token stayed with this browser
  }
  const argv = args();
  const at = argv.indexOf('--app');
  if (at >= 0 && at + 1 < argv.length) return argv[at + 1];
  return storage.keys().includes(ADDRESS_KEY) ? storage.get(ADDRESS_KEY) : '';
}

async function open(address: string): Promise<void> {
  connect(address, setStatus);
  await loadState();
  if (!connected()) return;
  storage.set(ADDRESS_KEY, address);
  await loadMedia();
  await loadShow();
}

function App(): i32 {
  const initial = givenAddress();
  if (initial !== '') open(initial);
  return <View className="grow">
    {connected() ? <EditorScreen /> : <ConnectScreen initial={initial} onConnect={(address: string) => { open(address); }} />}
  </View>;
}

setTheme(DARK);
startSending();
onFileDropped((path: string) => { sendFiles([path]); });
render(App, BACKGROUND, (dt: number) => {});
