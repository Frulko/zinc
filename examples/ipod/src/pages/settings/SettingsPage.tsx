// Settings: the scrobbling accounts (Last.fm signed in through the browser, ListenBrainz by its token), what waits to be sent or
// written, the listening history (imported from Last.fm and ListenBrainz, matched to this iPod, what it misses) and the size of the
// remote iPod's song cache, sharing the iPod with AudioMuse-AI and AudioMuse's deep analysis. Saved in config.json at once.
import { createSignal } from 'zinc:ui/solid';
import { Icon } from 'zinc:icons';
import { loadConfig } from '../../services/config';
import { scrobbler, playsWaiting, startLastfm, finishLastfm, awaitLastfm, testLastfm, testListenbrainz, signOutLastfm, setListenbrainz, setAudioCacheMb } from '../../services/listening';
import { notify } from '../../services/transfers';
import { Switch } from 'zinc:ui/kit';
import { shelfSnap, setShelfSnap, shelfScrollbar, setShelfScrollbar } from '../../forYou';
import { cacheDir } from '../../services/cache';
import { historyVersion, syncHistory, importing, importLastfmNow, importListenbrainzNow, importListenbrainzExport, lastfmLeft, listenbrainzLeft,
  historyCounts, unmatchedArtists, unmatchedTracks } from '../../services/historyJobs';
import { Ranked } from '../../services/history';
import { Button } from '../../components/Button';
import { ShareFields, SHARE_NOTE } from './ShareFields';
import { DeepFields, DEEP_NOTE } from './DeepFields';
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
  const [fmUser, setFmUser] = createSignal<string>(c.historyLastfmUser !== '' ? c.historyLastfmUser : c.lastfmUser);
  const [lbUser, setLbUser] = createSignal<string>(c.historyListenbrainzUser);
  syncHistory();
  const n = (x: number): string => `${Math.round(x)}`;
  const countsLine = (): string => {
    historyVersion();
    const k = historyCounts();
    if (k.listens === 0) return 'No listens yet: import your history, or play songs here.';
    return `${n(k.listens)} listens of ${n(k.songs)} songs · ${Math.round(k.matchedListens * 100 / k.listens)}% of the listens are songs of this iPod` +
      ` · unmatched: ${n(k.unmatchedSongs)} songs (${n(k.unmatchedListens)} listens)`;
  };
  const list = (rs: Ranked[]): string => rs.map((r: Ranked) => `${r.title !== '' ? `${r.artist} – ${r.title}` : r.artist} (${n(r.plays)})`).join(' · ');
  const missing = (): string => {
    historyVersion();
    const a = unmatchedArtists(5);
    return a.length === 0 ? '' : `Artists: ${list(a)}\nSongs: ${list(unmatchedTracks(8))}`;
  };
  const [said, setSaid] = createSignal<string>('');
  const [waiting, setWaiting] = createSignal<boolean>(false);   // the browser was opened: the approval is awaited (Finish asks at once)
  const [fmSaid, setFmSaid] = createSignal<string>(''); const [fmOk, setFmOk] = createSignal<boolean>(true);
  const [lbSaid, setLbSaid] = createSignal<string>(''); const [lbOk, setLbOk] = createSignal<boolean>(true);
  const [fmTesting, setFmTesting] = createSignal<boolean>(false); const [lbTesting, setLbTesting] = createSignal<boolean>(false);
  const fmReport = (t: string, ok: boolean): void => { setFmSaid(t); setFmOk(ok); };
  const lbReport = (t: string, ok: boolean): void => { setLbSaid(t); setLbOk(ok); };
  const signed = (name: string): void => {
    if (name === '') return;   // another sign-in took over
    setUser(name); setWaiting(false);
    fmReport(`Connected as ${name}: your listens now go to Last.fm`, true);
    notify('Last.fm', 'Last.fm', `Signed in as ${name}`, true);
  };
  const signIn = (): void => {
    fmReport('', true);
    startLastfm(key(), secret()).then(() => {
      setWaiting(true);
      awaitLastfm().then((n: string) => signed(n)).catch((e: Error) => { setWaiting(false); fmReport(e.message, false); });
    }).catch((e: Error) => fmReport(e.message, false));
  };
  const field = `h-[30] px-2.5 rounded-[7] border text-[13px] ${bg(CARD)} ${bd(BORDER)} ${fg(TEXT)}`;
  const status = (err: string, n: i32): string => `${n} listen${n === 1 ? '' : 's'} waiting${err !== '' ? ` · ${err}` : ''}`;
  return <ScrollView className="grow">
    <View className="flex-col gap-6 px-10 py-8">
      <View className="flex-col gap-1">
        <Text className={`text-[26px] font-bold ${fg(TEXT)}`}>Settings</Text>
        <Text className={`text-[13px] ${fg(MUTED)}`}>{`Every song heard for half its length or 4 minutes counts: on the iPod, and on the services below. ${playsWaiting()} play${playsWaiting() === 1 ? '' : 's'} wait to be written to this iPod (turn on Allow changes).`}</Text>
      </View>
      {said() !== '' ? <Text className={`text-[12px] ${fg(ERROR)}`}>{said()}</Text> : <View />}
      <Card icon="radio" title="Last.fm" note="Create an API account at last.fm/api/account/create, paste its key and secret, then sign in: the browser asks you to approve this app; once you allow it there, this card says so.">
        <Input className={field} value={key()} onInput={(v: string) => setKey(v)} placeholder="API key" />
        <Input className={field} value={secret()} onInput={(v: string) => setSecret(v)} placeholder="Shared secret" />
        <View className="flex-row items-center gap-2">
          {user() !== ''
            ? <View className="flex-row items-center gap-2">
                <Button icon="plug" label={fmTesting() ? 'Testing…' : 'Test connection'} onPress={() => { setFmTesting(true); testLastfm().then((t: string) => fmReport(`Connected: ${t}`, true)).catch((e: Error) => fmReport(e.message, false)).finally(() => setFmTesting(false)); }} />
                <Button icon="x" label="Sign out" onPress={() => { signOutLastfm(); setUser(''); fmReport('', true); }} />
              </View>
            : <View className="flex-row items-center gap-2">
                {waiting() ? <Button icon="check" label="Finish" onPress={() => { finishLastfm().then((n: string) => signed(n)).catch((e: Error) => fmReport(e.message, false)); }} /> : <View />}
                <Button icon="lock-open" label={waiting() ? 'Sign in again' : 'Sign in'} accent={!waiting()} onPress={signIn} />
              </View>}
          <Text className={`grow basis-0 text-[11px] ${fg(FAINT)}`}>{user() !== '' ? `Signed in as ${user()} · ${status(scrobbler.lastfmError, scrobbler.waitingLastfm())}` : waiting() ? 'Waiting for the approval in the browser…' : 'Off'}</Text>
        </View>
        {fmSaid() !== '' ? <Text className={`text-[12px] ${fg(fmOk() ? TEXT : ERROR)}`}>{fmSaid()}</Text> : <View />}
      </Card>
      <Card icon="radio" title="ListenBrainz" note="Paste the user token of listenbrainz.org/settings. Empty turns it off.">
        <Input className={field} value={lbToken()} onInput={(v: string) => setLbToken(v)} placeholder="User token" />
        <View className="flex-row items-center gap-2">
          <Button icon="check" label="Save" accent={true} onPress={() => setListenbrainz(lbToken())} />
          <Button icon="plug" label={lbTesting() ? 'Testing…' : 'Test connection'} onPress={() => { setLbTesting(true); testListenbrainz(lbToken()).then((n: string) => lbReport(`Connected: ${n}`, true)).catch((e: Error) => lbReport(e.message, false)).finally(() => setLbTesting(false)); }} />
          <Text className={`grow basis-0 text-[11px] ${fg(FAINT)}`}>{c.listenbrainzToken !== '' ? status(scrobbler.listenbrainzError, scrobbler.waitingListenbrainz()) : 'Off'}</Text>
        </View>
        {lbSaid() !== '' ? <Text className={`text-[12px] ${fg(lbOk() ? TEXT : ERROR)}`}>{lbSaid()}</Text> : <View />}
      </Card>
      <Card icon="list-music" title="Listening history" note="Your history on Last.fm and ListenBrainz, imported to this Mac (~/.zinc/ipod/history) for the For you page and matched to this iPod's songs. Last.fm needs the API key of its card and a user name; ListenBrainz a user name, or the export zip of listenbrainz.org/settings/export. Nothing is sent. An import can be stopped in Transfers: Resume goes on where it was.">
        <View className="flex-row items-center gap-2">
          <Input className={`${field} grow basis-0`} value={fmUser()} onInput={(v: string) => setFmUser(v)} placeholder="Last.fm user name" />
          <Button icon="download" label={importing() ? 'Importing…' : lastfmLeft() ? 'Resume' : 'Import now'} accent={true}
            onPress={() => { if (key().trim() === '') setSaid('Last.fm: paste the API key in the Last.fm card first'); else { setSaid(''); importLastfmNow(key(), fmUser()); } }} />
        </View>
        <View className="flex-row items-center gap-2">
          <Input className={`${field} grow basis-0`} value={lbUser()} onInput={(v: string) => setLbUser(v)} placeholder="ListenBrainz user name" />
          <Button icon="download" label={listenbrainzLeft() ? 'Resume' : 'Import'} onPress={() => importListenbrainzNow(lbUser())} />
          <Button icon="file-plus" label="Import zip" onPress={() => { importListenbrainzExport(); }} />
        </View>
        <Text className={`text-[12px] ${fg(MUTED)}`}>{countsLine()}</Text>
        {missing() !== '' ? <View className="flex-col gap-1">
          <Text className={`text-[11px] font-semibold ${fg(FAINT)}`}>Not on this iPod, most played first</Text>
          <Text className={`text-[11px] ${fg(MUTED)}`}>{missing()}</Text>
        </View> : <View />}
      </Card>
      <Card icon="heart" title="For you" note="How the shelves of For you scroll sideways.">
        <Switch checked={shelfSnap} onChange={setShelfSnap} label="Cards snap into place when a scroll ends" />
        <Switch checked={shelfScrollbar} onChange={setShelfScrollbar} label="Show the shelves' scroll bars" />
      </Card>
      <Card icon="hard-drive" title="The iPod's cache" note={`Covers, the library and a remote iPod's songs played are kept in ${cacheDir()}. The songs take at most this many MB (0: no limit); the least recently played go first.`}>
        <View className="flex-row items-center gap-2">
          <Input className={`${field} w-[120]`} value={cacheMb()} onInput={(v: string) => setCacheMb(v)} placeholder="2048" />
          <Button icon="check" label="Save" onPress={() => { const n = parseFloat(cacheMb()); if (Number.isNaN(n) || n < 0) setSaid('The size is a number of MB'); else { setAudioCacheMb(n); setSaid(''); } }} />
        </View>
      </Card>
      <Card icon="wifi" title="Share with AudioMuse" note={SHARE_NOTE}><ShareFields /></Card>
      <Card icon="audio-waveform" title="AudioMuse (deep analysis)" note={DEEP_NOTE}><DeepFields /></Card>
    </View>
  </ScrollView>;
}
