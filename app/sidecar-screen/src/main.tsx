// sidecar-screen: a screen with a network (a Raspberry Pi on HDMI, display-fbdev) as a Mac's display, in colour. The driver listens for
// the Mac and draws its screen itself (display-rmpp/stream.h, the reMarkable's protocol); this page only says where to connect and shows
// again when the Mac leaves. The Mac's side: app/sidecar/mac (sidecar-screen --host <this machine>).
import { render, createSignal } from 'zinc:ui/solid';
import { device, env } from 'zinc:sys';
import { readStatus } from 'zinc:network';

const PORT = env('ZINC_SIDECAR_PORT') !== '' ? parseInt(env('ZINC_SIDECAR_PORT')) : 7710;
const [state, setState] = createSignal<string>('starting');
const [where, setWhere] = createSignal<string>('');
// the driver listens once its screen is up, after the first frame: asked again each second, given up on after five
let tries = 0;
setInterval(() => {
  let s = device('stream.state');
  if (s === 'off' || s === '') s = device('stream.listen', `${PORT}`) === '1' ? 'waiting' : ++tries >= 5 ? 'failed' : 'starting';
  if (s !== state()) setState(s);
}, 1000);
async function lookUp(): Promise<void> {
  const st = await readStatus();
  const found: string[] = [];
  for (const nic of st.interfaces) if (nic.address !== '') found.push(nic.address.split('/')[0]);
  setWhere(found.join(', '));
}
lookUp();
setInterval(() => { lookUp(); }, 10000);

function App(): i32 {
  return <View className="flex-col grow items-center justify-center gap-8 px-16">
    <Text className="text-[56px] font-bold text-white">{state() === 'failed' ? 'Sidecar cannot start' : 'Waiting for the Mac'}</Text>
    <Text className="text-[30px] text-gray-300 text-center">{state() !== 'failed'
      ? `On the Mac: sidecar-screen --host ${where() !== '' ? where().split(', ')[0] : '<this screen>'} (port ${PORT}).`
      : `Port ${PORT} is taken, or this screen cannot be shared (see the app's log).`}</Text>
    <Text className="text-[24px] text-gray-500">{where() !== '' ? `This screen: ${where()}` : 'Looking for this screen\'s address…'}</Text>
  </View>;
}

render(() => <App />, 0x0a0a0a, null);
