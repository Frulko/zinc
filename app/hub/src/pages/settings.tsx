// Settings: the server address and pairing by the code the server prints (its admin page shows it too).
import { createSignal } from 'zinc:ui/solid';
import { SECTION, TITLE, LABEL, SMALL, FIELD } from '../constants';
import { server, paired, serverFingerprint, saveServer, pairWith } from '../state';
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
  </View>;
}
