// The transfer window: files larger than Discord lets this person send here (services/transfer.ts), sent to the transfer service they
// choose, with the progress; then their links are posted (a click: the guard wants a person's action for a message). Only these files go.
import { useState, useEffect } from 'zinc:ui/react';
import { stat } from 'zinc:fs';
import { store } from '../state';
import * as guard from '../safety/index';
import { PROVIDERS, Provider, TransferSettings, transferSettings, saveTransferSettings, transferKey, saveTransferKey, transferFile } from '../services/transfer';
import { BG_SIDE, BG_INPUT, BG_HOVER, BG_SELECTED, TEXT_MAIN, TEXT_MUTED, TEXT_STRONG } from '../constants';
import { rounded } from '../theme';

const MB = 1024 * 1024;
const sizeOf = (p: string): number => { try { return stat(p).size; } catch (e) { return 0; } };
const nameOf = (p: string): string => { const s = p.split('/'); return s[s.length - 1]; };
const mb = (n: number): string => `${(n / MB).toFixed(n < 10 * MB ? 1 : 0)} MB`;

let shownLinks: string[] = [];
/** The links of the last transfer (the tests). */
export function transferLinks(): string[] { return shownLinks; }
let steps = 0;
/** Progress reports seen (the tests: a large file comes in several). */
export function transferSteps(): i32 { return steps; }

export function Transfer() {
  const [t, setT] = useState<TransferSettings>(transferSettings());
  const [key, setKey] = useState<string>('');
  const [sent, setSent] = useState<number>(-1);   // -1: not started
  const [links, setLinks] = useState<string[]>([]);
  const [error, setError] = useState<string>('');
  let pi = 0;
  for (let i = 0; i < PROVIDERS.length; i++) if (PROVIDERS[i].id === t.provider) pi = i;
  const provider = PROVIDERS[pi];
  useEffect(() => { transferKey(provider.id).then((k: string) => { setKey(k); }); }, [pi]);   // its saved key, for each service chosen
  const paths = store.transferPaths, total = paths.reduce((n: number, p: string) => n + sizeOf(p), 0);
  const max = guard.uploadMax(store.channelId), busy = sent >= 0 && links.length === 0 && error === '';
  const choose = (id: string): void => { const n = new TransferSettings(); n.provider = id; n.url = t.url; setT(n); setError(''); };
  const start = (): void => {
    const d = new guard.Details();
    d.channel = store.channelId;
    const v = guard.begin('transfer', d, paths.length);   // every file now: a verdict lasts a minute, an upload may take longer
    if (!v.ok) { setError(v.message); return; }
    saveTransferSettings(t);
    saveTransferKey(t.provider, key);
    const each: number[] = paths.map((p: string) => 0);
    setSent(0); setError('');
    Promise.all(paths.map((p: string, i: i32) => transferFile(v, t, key, p, (s: number, all: number) => {
      each[i] = all > 0 ? sizeOf(p) * Math.min(1, s / all) : 0;
      steps++;
      setSent(each.reduce((a: number, b: number) => a + b, 0));
    }))).then((l: string[]) => { shownLinks = l; setLinks(l); })
      .catch((e: Error) => { setError(`The transfer failed: ${e.message}`); });
  };
  const close = (): void => { store.transferPaths = []; store.changed(); };
  const pct = total > 0 && sent > 0 ? Math.min(100, Math.round(sent * 100 / total)) : 0;
  return <View className="absolute inset-0 items-center justify-center bg-[#000000]/60">
    <View className={`w-[520] p-5 gap-3 ${rounded()} ${BG_SIDE}`} aria-label="Send large files">
      <Text className={`text-lg font-bold ${TEXT_STRONG}`}>Too large for Discord</Text>
      <Text className={`text-sm ${TEXT_MUTED}`}>{`You may send ${mb(max)} a file here. Send ${paths.length === 1 ? 'this file' : 'these files'} through a transfer service, then post the link.`}</Text>
      {paths.map((p: string) => <Text key={p} className={`text-sm ${TEXT_MAIN}`} numberOfLines={1}>{`${nameOf(p)}  ${mb(sizeOf(p))}`}</Text>)}
      {sent < 0 ? <View className="gap-1">
        {PROVIDERS.map((p: Provider) => <View key={p.id} className={`p-2 rounded ${p.id === t.provider ? BG_SELECTED : BG_HOVER}`} aria-label={p.name} onPress={() => choose(p.id)}>
          <Text className={`text-sm font-semibold ${TEXT_STRONG}`}>{p.name}</Text>
          <Text className={`text-xs ${TEXT_MUTED}`}>{p.note}</Text>
        </View>)}
        {provider.url ? <Input className={`h-[32] px-2 rounded border-0 ${BG_INPUT} ${TEXT_MAIN}`} value={t.url} placeholder="https://share.example.org" aria-label="Server address"
          onInput={(s: string) => { const n = new TransferSettings(); n.provider = t.provider; n.url = s; setT(n); }} /> : null}
        {provider.key ? <Input type="password" className={`h-[32] px-2 rounded border-0 ${BG_INPUT} ${TEXT_MAIN}`} value={key} placeholder="API key (kept in the keychain)" aria-label="API key"
          onInput={(s: string) => setKey(s)} /> : null}
      </View> : <View className="gap-1">
        <View className={`h-[8] rounded-full ${BG_INPUT} overflow-hidden`}><View className={`h-[8] w-[${pct}%] bg-[var(--dc-accent)]`} /></View>
        <Text className={`text-xs ${TEXT_MUTED}`}>{links.length > 0 ? 'Sent.' : `${mb(sent)} of ${mb(total)} to ${provider.name}`}</Text>
        {links.map((l: string) => <Text key={l} className="text-sm text-[var(--dc-link)]" numberOfLines={1}>{l}</Text>)}
      </View>}
      {error !== '' ? <Text className="text-sm text-[var(--dc-error)]">{error}</Text> : null}
      <View className="flex-row justify-end gap-2">
        <View className={`px-4 h-[34] justify-center rounded ${BG_HOVER}`} aria-label="Cancel" onPress={close}><Text className={`text-sm ${TEXT_MAIN}`}>{busy ? 'Hide' : 'Cancel'}</Text></View>
        {links.length > 0
          ? <View className="px-4 h-[34] justify-center rounded bg-[var(--dc-accent)]" aria-label="Post the links" onPress={() => { store.sendLinks(links); }}><Text className="text-sm text-white font-semibold">Post the links</Text></View>
          : !busy ? <View className="px-4 h-[34] justify-center rounded bg-[var(--dc-accent)]" aria-label="Upload" onPress={start}><Text className="text-sm text-white font-semibold">Upload</Text></View> : null}
      </View>
    </View>
  </View>;
}
