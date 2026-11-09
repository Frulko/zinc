// The mapper's editor, one program for a page the mapper serves and for a native client on any machine.
// A page connects to where it came from; a native client takes `--app <address>` or asks for it, then remembers it.
import { createSignal, render } from 'zinc:ui/solid';
import { current } from 'zinc:system/deeplink';
import * as storage from 'zinc:storage';
import { DARK, setTheme, useQuietTheme } from 'zinc:ui/kit';
import { args, platform } from 'zinc:sys';
import { ConnectScreen } from './components/ConnectScreen';
import { EditorScreen } from './components/EditorScreen';
import { RemoteScreen } from './components/RemoteScreen';
import { ADDRESS_KEY, BACKGROUND } from './constants';
import { connect, startSending } from './services/link';
import { onFileDropped } from './services/files';
import { connected, loadMedia, loadShow, loadState, setConnected, setStatus } from './state';
import { sendFiles } from './transfers';

function givenAddress(): string {
  if (platform() === 'web') {
    const url = current()[0];
    const hash = url.indexOf('#');
    const page = hash < 0 ? url : url.slice(0, hash);
    if (page.includes('?token=') || !storage.keys().includes(ADDRESS_KEY)) return page;
    const saved = storage.get(ADDRESS_KEY);
    const tokenAt = saved.indexOf('?token=');
    const savedPage = tokenAt < 0 ? saved : saved.slice(0, tokenAt);
    // A phone can scan several mappers: a token for one origin must not be sent to another.
    return savedPage === page ? saved : page;
  }
  const argv = args();
  const at = argv.indexOf('--app');
  if (at >= 0 && at + 1 < argv.length) return argv[at + 1];
  return storage.keys().includes(ADDRESS_KEY) ? storage.get(ADDRESS_KEY) : '';
}

async function open(address: string): Promise<void> {
  connect(address, (message: string) => { setStatus(message); setConnected(false); });
  await loadState();
  if (!connected()) return;
  // Linked corners must be loaded before either editor can move a point.
  setConnected(false);
  try {
    await loadMedia();
    await loadShow();
    storage.set(ADDRESS_KEY, address);
    setConnected(true);
  } catch (e) {
    setStatus(`${e}`);
  }
}

function App(): i32 {
  const remote = platform() === 'web' && current()[0].endsWith('#remote');
  const initial = givenAddress();
  if (initial !== '') open(initial);
  return <View className="grow">
    {connected() ? (remote ? <RemoteScreen /> : <EditorScreen />) : <ConnectScreen initial={initial} onConnect={(address: string) => { open(address); }} />}
  </View>;
}

setTheme(DARK);
useQuietTheme('amber');
startSending();
onFileDropped((path: string) => { sendFiles([path]); });
render(App, BACKGROUND, (dt: number) => {});
