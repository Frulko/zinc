// Settings: the server address and pairing by the code the server prints (its admin page shows it too).
import { createSignal } from 'zinc:ui/solid';
import { SECTION, TITLE, LABEL, SMALL, FIELD } from '../constants';
import { server, paired, serverFingerprint, saveServer, pairWith, cleanAppLoad, header, toggleHeader } from '../state';
import { SolidButton, OutlineButton } from '../components/buttons';

export function SettingsPage(): i32 {
  const [url, setUrl] = createSignal<string>(server());
  const [code, setCode] = createSignal<string>('');
  return <View className={SECTION}>
    <Text className={TITLE}>Server</Text>
    <Text className={LABEL}>The address of the Zinc hub server (zinc run app/hub-server).</Text>
    <View className="flex-row gap-6 items-center">
      <Input className={`grow ${FIELD}`} inputMode="url" value={url()} onInput={(v: string) => setUrl(v)} />
      <OutlineButton label="Save" onClick={() => saveServer(url())} />
    </View>
    <View className="h-[2px] bg-black" />
    <Text className={TITLE}>Pairing</Text>
    <Text className={LABEL}>{paired() ? `Paired. Server key ${serverFingerprint()}…` : 'Not paired.'}</Text>
    <Text className={SMALL}>Type the six-digit code the server prints; check that its server key starts with the digits above.</Text>
    <View className="flex-row gap-6 items-center">
      <Input className={`w-[420px] ${FIELD}`} inputMode="numeric" placeholder="000000" value={code()} onInput={(v: string) => setCode(v)} />
      <SolidButton label={paired() ? 'Pair again' : 'Pair'} onClick={() => { pairWith(code()); setCode(''); }} />
    </View>
    <View className="h-[2px] bg-black" />
    <Text className={TITLE}>AppLoad</Text>
    <Text className={SMALL}>Removes the Zinc tiles whose app is no longer on the tablet. Other tiles are left alone.</Text>
    <View className="flex-row"><OutlineButton label="Clean up AppLoad" onClick={() => cleanAppLoad()} /></View>
    <View className="h-[2px] bg-black" />
    <Text className={TITLE}>Experimental</Text>
    <Text className={SMALL}>reMarkable header: apps open below the tablet's own top bar (menu, logo, battery, time) instead of full screen. Needs the Zinc AppLoad with patch 0005; takes effect the next time an app opens.</Text>
    <View className="flex-row"><OutlineButton label={header() ? 'reMarkable header: on' : 'reMarkable header: off'} onClick={() => toggleHeader()} /></View>
  </View>;
}
