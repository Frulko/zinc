// sidecar: the reMarkable half of Sidecar (app/sidecar/mac is the Mac's). The driver (display-rmpp, stream.h) listens for the Mac and draws
// its screen itself, without this program's frames; this screen only says how to connect and shows again when the Mac leaves.
import { RemarkableBar, RemarkableApp } from 'zinc:remarkable';
import { render, createSignal } from 'zinc:ui/solid';
import { setPressFeedback } from 'zinc:ui';
import { quit } from 'zinc:gfx';
import { device, env } from 'zinc:sys';

const PORT = env('ZINC_SIDECAR_PORT') !== '' ? parseInt(env('ZINC_SIDECAR_PORT')) : 7710;
// the driver listens once its screen is up, after the first frame: asked again each second, given up on after five
const [state, setState] = createSignal<string>('starting');
let tries = 0;
setInterval(() => {
  let s = device('stream.state');
  if (s === 'off' || s === '') s = device('stream.listen', `${PORT}`) === '1' ? 'waiting' : ++tries >= 5 ? 'failed' : 'starting';
  if (s !== state()) setState(s);
}, 1000);

const TEXT = 'text-[34px] text-black';

function App(): i32 {
  return <View className="flex-col grow bg-white">
    <RemarkableBar title="Sidecar" onHome={() => {}} onQuit={() => quit()} />
    <View className="flex-col grow items-center justify-center gap-8 px-16">
      <Text className="text-[56px] font-bold text-black">{state() === 'connected' ? 'Connected' : state() === 'failed' ? 'Sidecar cannot start' : 'Waiting for the Mac'}</Text>
      <Text className={TEXT + ' text-center'}>{state() !== 'failed'
        ? `Connect the tablet with its USB cable, then start Sidecar on the Mac. It finds the tablet at 10.11.99.1, port ${PORT}.`
        : `Port ${PORT} is taken, or this screen cannot be shared (see the app's log). Quit Sidecar and open it again.`}</Text>
      <View className="flex-col gap-4 mt-8 self-stretch">
        <Text className={TEXT}>• A finger or the Marker is the Mac's mouse: tap to click, drag to drag.</Text>
        <Text className={TEXT}>• Two fingers scroll; a two-finger tap cleans the screen with a full refresh.</Text>
        <Text className={TEXT}>• Hold the tablet sideways and the Mac's display turns with it.</Text>
        <Text className={TEXT}>• The Mac's Sidecar window sets the contrast, the pointer and the refresh live.</Text>
      </View>
    </View>
  </View>;
}

setPressFeedback(false);
render(() => <RemarkableApp app={App} />, 0xffffff, null);
