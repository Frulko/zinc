// sidecar: the reMarkable half of Sidecar (app/sidecar/mac is the Mac's). The driver (display-rmpp, stream.h) listens for the Mac and draws
// its screen itself, without this program's frames; this screen only says how to connect and shows again when the Mac leaves.
import { RemarkableBar, RemarkableApp } from 'zinc:remarkable';
import { render, createSignal } from 'zinc:ui/solid';
import { setPressFeedback } from 'zinc:ui';
import { quit } from 'zinc:gfx';
import { device, env } from 'zinc:sys';

const PORT = env('ZINC_SIDECAR_PORT') !== '' ? parseInt(env('ZINC_SIDECAR_PORT')) : 7710;
const listening = device('stream.listen', `${PORT}`) === '1';
const [state, setState] = createSignal<string>(device('stream.state'));
setInterval(() => { const s = device('stream.state'); if (s !== state()) setState(s); }, 1000);

const TEXT = 'text-[34px] text-black';

function App(): i32 {
  return <View className="flex-col grow bg-white">
    <RemarkableBar title="Sidecar" onHome={() => {}} onQuit={() => quit()} />
    <View className="flex-col grow items-center justify-center gap-8 px-16">
      <Text className="text-[56px] font-bold text-black">{listening ? (state() === 'connected' ? 'Connected' : 'Waiting for the Mac') : 'Sidecar cannot start'}</Text>
      <Text className={TEXT + ' text-center'}>{listening
        ? `Connect the tablet with its USB cable, then start Sidecar on the Mac. It finds the tablet at 10.11.99.1, port ${PORT}.`
        : `Port ${PORT} is taken, or this screen cannot be shared. Quit Sidecar and open it again.`}</Text>
    </View>
  </View>;
}

setPressFeedback(false);
render(() => <RemarkableApp app={App} />, 0xffffff, null);
