// The Settings card "AudioMuse (deep analysis)" (deep.ts): where AudioMuse-AI is and its API token, Test connection, Analyse now and
// Sync results (both Transfers jobs), and what it knows of this iPod.
import { createSignal } from 'zinc:ui/solid';
import { loadConfig, saveConfig } from '../../services/config';
import { museState, museAnalysed, deepNote, testMuse, analyseMuse, syncMuse } from '../../deep';
import { Button } from '../../components/Button';
import { bg, bd, fg, CARD, BORDER, TEXT, FAINT, ERROR } from '../../constants';

export const DEEP_NOTE = 'AudioMuse-AI analyses the sound of each song (its own program, run beside this app: turn on Share with AudioMuse above so it can read this iPod). Genius and For you then mix how songs sound (65%) with what you play together (35%); a song it has not analysed keeps the light picks. Its address and API_TOKEN:';

export function DeepFields(): i32 {
  const c = loadConfig();
  const [url, setUrl] = createSignal<string>(c.museUrl);
  const [token, setToken] = createSignal<string>(c.museToken);
  const field = `h-[30] px-2.5 rounded-[7] border text-[13px] ${bg(CARD)} ${bd(BORDER)} ${fg(TEXT)}`;
  const keep = (): void => { const k = loadConfig(); k.museUrl = url().trim(); k.museToken = token().trim(); saveConfig(k); };
  const status = (): string => {
    const st = museState(), note = deepNote();
    const reach = st === '' ? 'Not tested' : st === 'online' ? `Reachable${museAnalysed() >= 0 ? ` · ${museAnalysed()} songs analysed` : ''}`
      : st === 'offline' ? 'Not reachable: is AudioMuse running?' : st;
    return note !== '' && st !== 'offline' ? `${reach} · ${note}` : note !== '' ? note : `${reach} · never synced`;
  };
  const bad = (): boolean => museState() !== '' && museState() !== 'online';
  return <View className="flex-col gap-3">
    <View className="flex-row gap-2">
      <Input className={`${field} grow basis-0`} value={url()} onInput={(v: string) => setUrl(v)} placeholder="http://127.0.0.1:8000" />
      <Input className={`${field} grow basis-0`} value={token()} onInput={(v: string) => setToken(v)} placeholder="API token" />
    </View>
    <View className="flex-row items-center gap-2">
      <Button icon="plug" label="Test connection" onPress={() => { keep(); testMuse(); }} />
      <Button icon="audio-waveform" label="Analyse now" accent={true} onPress={() => { keep(); analyseMuse(); }} />
      <Button icon="refresh-cw" label="Sync results" onPress={() => { keep(); syncMuse(); }} />
    </View>
    <Text className={`text-[11px] ${bad() ? fg(ERROR) : fg(FAINT)}`}>{status()}</Text>
  </View>;
}
