// The Settings card "Share with AudioMuse" (services/share.ts): the port, the Subsonic account AudioMuse-AI signs in with (user and
// password, or the API key), the switch, and what to type into AudioMuse's Setup Wizard.
import { createSignal } from 'zinc:ui/solid';
import { loadConfig, saveConfig } from '../../services/config';
import { sharePort, startSharing, stopSharing } from '../../services/share';
import { allowChanges } from '../../state';
import { Button } from '../../components/Button';
import { bg, bd, fg, CARD, BORDER, TEXT, FAINT, ERROR } from '../../constants';

export const SHARE_NOTE = 'AudioMuse-AI analyses the songs of the iPod plugged into this Mac and makes playlists of similar songs: it reads the iPod as a Subsonic server. In its Setup Wizard pick Navidrome and give the address, the user and password (or the API key) below. Its playlists are written to the iPod only while Allow changes is on.';

export function ShareFields(): i32 {
  const c = loadConfig();
  const [port, setPort] = createSignal<string>(`${c.sharePort}`);
  const [user, setUser] = createSignal<string>(c.shareUser);
  const [password, setPassword] = createSignal<string>(c.sharePassword);
  const [said, setSaid] = createSignal<string>('');
  const field = `h-[30] px-2.5 rounded-[7] border text-[13px] ${bg(CARD)} ${bd(BORDER)} ${fg(TEXT)}`;
  const turnOn = (): void => {
    const p = parseInt(port());
    if (Number.isNaN(p) || p < 1024 || p > 65535) { setSaid('The port is a number from 1024 to 65535'); return; }
    const k = loadConfig();
    k.sharePort = p; k.shareUser = user().trim(); k.sharePassword = password(); k.shareOn = true;
    saveConfig(k);
    const why = startSharing();
    if (why !== '') { k.shareOn = false; saveConfig(k); }
    setSaid(why);
  };
  const turnOff = (): void => { stopSharing(); const k = loadConfig(); k.shareOn = false; saveConfig(k); setSaid(''); };
  return <View className="flex-col gap-3">
    <View className="flex-row gap-2">
      <Input className={`${field} w-[90]`} value={port()} onInput={(v: string) => setPort(v)} placeholder="4533" />
      <Input className={`${field} grow basis-0`} value={user()} onInput={(v: string) => setUser(v)} placeholder="User" />
      <Input className={`${field} grow basis-0`} value={password()} onInput={(v: string) => setPassword(v)} placeholder="Password" />
    </View>
    <View className="flex-row items-center gap-2">
      {sharePort() !== 0
        ? <Button icon="x" label="Stop sharing" onPress={turnOff} />
        : <Button icon="wifi" label="Share" accent={true} onPress={turnOn} />}
      <Text className={`grow basis-0 text-[11px] ${said() !== '' ? fg(ERROR) : fg(FAINT)}`}>{said() !== '' ? said()
        : sharePort() !== 0 ? `On: http://host.docker.internal:${sharePort()} (from Docker), user ${loadConfig().shareUser}, API key ${loadConfig().shareApiKey}${allowChanges() ? '' : ' · read only until Allow changes is on'}`
        : 'Off'}</Text>
    </View>
  </View>;
}
