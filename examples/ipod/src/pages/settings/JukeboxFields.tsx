// The Settings card "jukebox": the address and token of the library server the Add page takes songs from (services/jukebox.ts),
// kept in config.json as typed, and Test connection.
import { createSignal } from 'zinc:ui/solid';
import { loadConfig, saveConfig } from '../../services/config';
import * as jb from '../../services/jukebox';
import { Button } from '../../components/Button';
import { bg, bd, fg, CARD, BORDER, TEXT, FAINT, ERROR } from '../../constants';

export const JUKEBOX_NOTE = 'Your jukebox library (or any Subsonic server, such as Navidrome): the Add page browses it and puts albums, songs and playlists on the iPod, converted to AAC when the iPod cannot play the original. jukebox: its address and an API token (jukebox Settings, tokens). A Subsonic server: user:password.';

export function JukeboxFields(): i32 {
  const c = loadConfig();
  const [url, setUrl] = createSignal<string>(c.jukeboxUrl);
  const [token, setToken] = createSignal<string>(c.jukeboxToken);
  const [said, setSaid] = createSignal<string>('');
  const [ok, setOk] = createSignal<boolean>(true);
  const [testing, setTesting] = createSignal<boolean>(false);
  const field = `h-[30] px-2.5 rounded-[7] border text-[13px] ${bg(CARD)} ${bd(BORDER)} ${fg(TEXT)}`;
  const keep = (): void => { const k = loadConfig(); k.jukeboxUrl = url().trim(); k.jukeboxToken = token().trim(); saveConfig(k); };
  const test = async (): Promise<void> => {
    setTesting(true); setSaid('');
    try { setSaid(await jb.describe(await jb.connect(url(), token()))); setOk(true); }
    catch (e) { setSaid((e as Error).message); setOk(false); }
    setTesting(false);
  };
  return <View className="flex-col gap-3">
    <View className="flex-row gap-2">
      <Input className={`${field} grow basis-0`} value={url()} onInput={(v: string) => { setUrl(v); keep(); }} placeholder="http://nas.local:8787" />
      <Input className={`${field} grow basis-0`} value={token()} onInput={(v: string) => { setToken(v); keep(); }} placeholder="API token, or user:password" />
    </View>
    <View className="flex-row items-center gap-2">
      <Button icon="plug" label={testing() ? 'Testing…' : 'Test connection'} onPress={() => { test(); }} />
      <Text className={`grow basis-0 text-[11px] ${fg(FAINT)}`}>{url().trim() === '' ? 'Off' : 'Saved'}</Text>
    </View>
    {said() !== '' ? <Text className={`text-[12px] ${fg(ok() ? TEXT : ERROR)}`}>{said()}</Text> : <View />}
  </View>;
}
