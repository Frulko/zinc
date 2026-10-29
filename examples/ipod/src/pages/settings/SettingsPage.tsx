// Settings: the scrobbling accounts (Last.fm signed in through the browser, ListenBrainz by its token), what waits to be sent or
// written, and the size of the remote iPod's song cache. Saved in config.json at once.
import { createSignal } from 'zinc:ui/solid';
import { Icon } from 'zinc:icons';
import { loadConfig } from '../../services/config';
import { scrobbler, playsWaiting, startLastfm, finishLastfm, signOutLastfm, setListenbrainz, setAudioCacheMb } from '../../services/listening';
import { cacheDir } from '../../services/cache';
import { Button } from '../../components/Button';
import { bg, bd, fg, color, CARD, BORDER, TEXT, MUTED, FAINT, ACCENT, ERROR } from '../../constants';

function Card(props: { icon: string; title: string; note: string; children: () => i32 }): i32 {
  return <View className={`flex-col gap-3 w-[560] p-5 rounded-[14] border ${bg(CARD)} ${bd(BORDER)}`}>
    <View className="flex-row items-center gap-2">
      <Icon name={props.icon} size={16} color={() => color(ACCENT)} strokeWidth={2} />
      <Text className={`text-[15px] font-semibold ${fg(TEXT)}`}>{props.title}</Text>
    </View>
    <Text className={`text-[12px] ${fg(MUTED)}`}>{props.note}</Text>
    {props.children()}
  </View>;
}

export function SettingsPage(): i32 {
  const c = loadConfig();
  const [key, setKey] = createSignal<string>(c.lastfmKey);
  const [secret, setSecret] = createSignal<string>(c.lastfmSecret);
  const [user, setUser] = createSignal<string>(c.lastfmSession !== '' ? c.lastfmUser : '');
  const [lbToken, setLbToken] = createSignal<string>(c.listenbrainzToken);
  const [cacheMb, setCacheMb] = createSignal<string>(`${c.audioCacheMb}`);
  const [said, setSaid] = createSignal<string>('');
  const [waiting, setWaiting] = createSignal<boolean>(false);   // the browser was opened: Finish takes the session
  const field = `h-[30] px-2.5 rounded-[7] border text-[13px] ${bg(CARD)} ${bd(BORDER)} ${fg(TEXT)}`;
  const status = (err: string, n: i32): string => `${n} listen${n === 1 ? '' : 's'} waiting${err !== '' ? ` · ${err}` : ''}`;
  return <ScrollView className="grow">
    <View className="flex-col gap-6 px-10 py-8">
      <View className="flex-col gap-1">
        <Text className={`text-[26px] font-bold ${fg(TEXT)}`}>Settings</Text>
        <Text className={`text-[13px] ${fg(MUTED)}`}>{`Every song heard for half its length or 4 minutes counts: on the iPod, and on the services below. ${playsWaiting()} play${playsWaiting() === 1 ? '' : 's'} wait to be written to this iPod (turn on Allow changes).`}</Text>
      </View>
      {said() !== '' ? <Text className={`text-[12px] ${fg(ERROR)}`}>{said()}</Text> : <View />}
      <Card icon="radio" title="Last.fm" note="Create an API account at last.fm/api/account/create, paste its key and secret, then sign in: the browser asks you to approve this app; come back and press Finish.">
        <Input className={field} value={key()} onInput={(v: string) => setKey(v)} placeholder="API key" />
        <Input className={field} value={secret()} onInput={(v: string) => setSecret(v)} placeholder="Shared secret" />
        <View className="flex-row items-center gap-2">
          {user() !== ''
            ? <Button icon="x" label="Sign out" onPress={() => { signOutLastfm(); setUser(''); }} />
            : waiting()
              ? <Button icon="check" label="Finish" accent={true} onPress={() => { finishLastfm().then((n: string) => { setUser(n); setWaiting(false); setSaid(''); }).catch((e: Error) => setSaid(e.message)); }} />
              : <Button icon="lock-open" label="Sign in" accent={true} onPress={() => { startLastfm(key(), secret()).then(() => { setWaiting(true); setSaid(''); }).catch((e: Error) => setSaid(e.message)); }} />}
          <Text className={`grow basis-0 text-[11px] ${fg(FAINT)}`}>{user() !== '' ? `Signed in as ${user()} · ${status(scrobbler.lastfmError, scrobbler.waitingLastfm())}` : 'Off'}</Text>
        </View>
      </Card>
      <Card icon="radio" title="ListenBrainz" note="Paste the user token of listenbrainz.org/settings. Empty turns it off.">
        <Input className={field} value={lbToken()} onInput={(v: string) => setLbToken(v)} placeholder="User token" />
        <View className="flex-row items-center gap-2">
          <Button icon="check" label="Save" accent={true} onPress={() => setListenbrainz(lbToken())} />
          <Text className={`grow basis-0 text-[11px] ${fg(FAINT)}`}>{c.listenbrainzToken !== '' ? status(scrobbler.listenbrainzError, scrobbler.waitingListenbrainz()) : 'Off'}</Text>
        </View>
      </Card>
      <Card icon="hard-drive" title="The iPod's cache" note={`Covers, the library and a remote iPod's songs played are kept in ${cacheDir()}. The songs take at most this many MB (0: no limit); the least recently played go first.`}>
        <View className="flex-row items-center gap-2">
          <Input className={`${field} w-[120]`} value={cacheMb()} onInput={(v: string) => setCacheMb(v)} placeholder="2048" />
          <Button icon="check" label="Save" onPress={() => { const n = parseFloat(cacheMb()); if (Number.isNaN(n) || n < 0) setSaid('The size is a number of MB'); else { setAudioCacheMb(n); setSaid(''); } }} />
        </View>
      </Card>
    </View>
  </ScrollView>;
}
