import { createSignal } from 'zinc:ui/solid';
import { Device, Specification } from '../models';
import { Action, Choice, Fact } from './Controls';
import { INK, MUTED, BORDER } from '../constants';
import { busy, inspectSyscfg } from '../state';

export const [tab, setTab] = createSignal<string>('identity');
export function IdentityDetails(props: { device: Device }): i32 {
  const d = props.device, p = d.profile;
  return <View className="flex-col gap-3">
    <View className="flex-row gap-1.5 flex-wrap">
      <Choice label="Identité & SysCFG" active={tab() === 'identity'} onPress={() => setTab('identity')} />
      <Choice label="Spécifications" active={tab() === 'specs'} onPress={() => setTab('specs')} />
      <Choice label="Firmwares" active={tab() === 'firmware'} onPress={() => setTab('firmware')} />
    </View>
    <Fact label="Type déclaré" value={p.typeName + ' · ' + p.generation} />
    {tab() === 'identity' ? <View className="flex-col gap-3">
      <View className={`flex-col gap-2 p-3 rounded-[7] border ${BORDER} bg-[#f1eee1]`}>
        <Text className={`text-[12px] font-semibold ${INK}`}>{'SysCFG : ' + p.status}</Text>
        <Text className={`text-[11px] ${MUTED}`} numberOfLines={5}>{p.detail}</Text>
        {p.changed.length > 0 ? <Text className="text-[11px] text-[#946426]" numberOfLines={3}>{'Champs différents : ' + p.changed.join(', ')}</Text> : <View />}
        {p.hints.map((s: string) => <Text className="text-[11px] text-[#946426]" numberOfLines={4}>{s}</Text>)}
      </View>
      <View className="flex-row flex-wrap gap-2">
        <Action label="Analyser un dump SysCFG…" disabled={busy()} onPress={() => { inspectSyscfg(false); }} />
        <Action label="Comparer une référence…" disabled={busy() || p.fields.length === 0} onPress={() => { inspectSyscfg(true); }} />
      </View>
      {p.fields.map((s: Specification) => <Fact label={s.label} value={s.value} />)}
      <Text className={`text-[10px] ${MUTED}`} numberOfLines={4}>Le dump et la référence sont des fichiers fournis, jamais une lecture directe de la NOR. Une référence différente n’est pas automatiquement une sauvegarde d’usine de cet iPod.</Text>
    </View> : tab() === 'specs' ? <View className="flex-col gap-1">
      {p.specs.map((s: Specification) => <Fact label={s.label} value={s.value} />)}
      <Fact label="Carte physique" value={d.physical} />
      <Fact label="Volume actuel" value={d.filesystem + ' · ' + d.scheme} />
      <Fact label="Stockage mesuré" value={d.size > 0 ? (d.size / 1000000000).toFixed(1) + ' Go' : 'Non disponible'} />
      <Fact label="Blocs logiques" value={d.blockSize > 0 ? '' + d.blockSize + ' octets' : 'Non déterminés'} />
      <Text className={`text-[11px] ${MUTED}`} numberOfLines={4}>Caractéristiques du modèle déclaré, issues du catalogue. Une conversion SysCFG peut masquer la carte d’origine. Le stockage mesuré figure séparément.</Text>
    </View> : <View className="flex-col gap-2">
      <Fact label="Branche d’origine" value={p.factoryMaximum} />
      <Fact label="Maximum connu" value={p.maximum} />
      <Text className={`text-[11px] ${MUTED}`} numberOfLines={5}>{p.advice}</Text>
      <Text className="text-[11px] text-[#946426]" numberOfLines={4}>Pour un Classic converti, 2.0.2 / 2.0.4 / 2.0.5 exigent des identités compatibles distinctes. Ce maximum descriptif n’autorise aucune installation.</Text>
    </View>}
  </View>;
}
