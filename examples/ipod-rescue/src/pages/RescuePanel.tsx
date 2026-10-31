// Embeddable surface: lifecycle belongs to the host, so importing this panel never starts a process.
import { Icon } from 'zinc:icons';
import { Device, RecoveryPlan, Firmware, LogEntry, RecoveryStep } from '../models';
import { Action, Choice, Fact } from '../components/Controls';
import { INK, MUTED, BORDER, CARD, FAULT_IDS, FAULT_LABELS } from '../constants';
import { devices, selected, selectedId, selectDevice, mode, chooseMode, scan, filesystem, chooseFormat,
  busy, ready, notice, failed, logs, workflow, fault, setFault, makePlan, recoveryPlan, firmware,
  inspectArchive, backup, rehearse, exportLogs, revealSession, revealArtifact, artifact } from '../state';

function DeviceRow(props: { device: Device }): i32 {
  const d = props.device;
  return <Button disabled={busy()} onClick={() => selectDevice(d.id)}
    className={`flex-col items-stretch w-full min-w-0 gap-1.5 p-3.5 rounded-[8] border ${selectedId() === d.id ? 'bg-[#e0eddf] border-[#91b197]' : `bg-[#fffef9] ${BORDER} hover:bg-[#e8ebe1] focus:bg-[#e8ebe1]`}`}>
    <View className="flex-row items-center gap-2 w-full min-w-0">
      <Icon name={d.connection === 'disk' ? 'hard-drive' : 'usb'} size={16} color={() => 0x255c48} />
      <Text className={`grow basis-0 min-w-0 text-[12px] font-bold ${INK}`} numberOfLines={2}>{d.name}</Text>
    </View>
    <Text className={`text-[11px] ${MUTED}`}>{d.firmware !== '' ? 'Firmware déclaré · ' + d.firmware : d.connection}</Text>
    <Text className={`text-[10px] ${MUTED}`}>{d.mode === 'simulation' ? 'APPAREIL FICTIF' : 'LECTURE SEULE'}</Text>
  </Button>;
}
function DeviceDetails(props: { device: Device }): i32 {
  const d = props.device;
  return <View className="flex-col gap-3">
    <View className="flex-row items-center gap-5">
      <View className="w-[76] h-[116] bg-[#e8e9e0] border border-[#b5beb4] rounded-[12] items-center pt-3 gap-3 shrink-0">
        <View className="w-[58] h-[35] bg-[#bfd2b6] border border-[#92a98d] rounded-[3] justify-center items-center">
          <Text className="text-[9px] text-[#334f38] font-bold">{d.mode === 'simulation' ? 'SIMULATEUR' : 'DIAGNOSTIC'}</Text>
        </View>
        <View className="w-[45] h-[45] rounded-full bg-[#fffef9] border border-[#c5ccbf] items-center justify-center">
          <View className="w-[17] h-[17] rounded-full bg-[#d6ddd0]" />
        </View>
      </View>
      <View className="grow basis-0 flex-col gap-1">
        <Text className={`text-[19px] font-bold ${INK}`} numberOfLines={2}>{d.name}</Text>
        <Text className={`text-[12px] ${MUTED}`}>{d.model}</Text>
        <Text className="text-[11px] text-[#255c48] font-semibold">{d.mode === 'simulation' ? 'Répétition locale, sans USB' : 'Aucune écriture matérielle autorisée'}</Text>
      </View>
    </View>
    <View className="flex-col">
      <Fact label="Firmware déclaré" value={d.firmware || 'Inconnu'} />
      <Fact label="Matériel physique" value={d.physical} />
      <Fact label="Volume actuel" value={d.filesystem + ' · ' + d.scheme} />
      <Fact label="Capacité exposée" value={d.size > 0 ? (d.size / 1000000000).toFixed(1) + ' Go' : 'Non disponible'} />
      <Fact label="Blocs logiques" value={d.blockSize > 0 ? '' + d.blockSize + ' octets' : 'Non déterminés'} />
    </View>
    {d.evidence.map((s: string) => <Text className={`text-[11px] ${MUTED}`} numberOfLines={2}>{'• ' + s}</Text>)}
    {d.warnings.map((s: string) => <Text className="text-[11px] text-[#946426]" numberOfLines={3}>{s}</Text>)}
    {d.mode === 'hardware' ? <Action label="Sauvegarder les métadonnées" icon="archive" disabled={busy() || d.connection !== 'disk'} onPress={backup} /> : <View />}
    <Text className={`text-[10px] ${MUTED}`} numberOfLines={3}>La copie des métadonnées exclut musique, pochettes, partitions et NOR. Elle ne permet pas à elle seule une restauration complète.</Text>
  </View>;
}
function Preparation(): i32 {
  const f = (): Firmware | null => firmware();
  return <View className="flex-col gap-3">
    <Text className={`text-[11px] font-semibold ${MUTED}`}>VOLUME APRÈS RESTAURATION</Text>
    <View className="flex-row gap-2">
      <Choice label="FAT32 · Mac / Windows" active={filesystem() === 'FAT32'} disabled={busy()} onPress={() => chooseFormat('FAT32')} />
      <Choice label="HFS+ · Mac" active={filesystem() === 'HFS+'} disabled={busy()} onPress={() => chooseFormat('HFS+')} />
    </View>
    <Text className={`text-[11px] ${MUTED}`} numberOfLines={3}>{filesystem() === 'HFS+' ? 'HFS+ exclut Rockbox et reste à qualifier sur chaque modèle. Ici, seul son parcours simulé est disponible.' : 'FAT32 est le choix pour Rockbox et les échanges Mac / Windows. La recette matérielle reste à qualifier.'}</Text>
    <View className="flex-row gap-2 items-center mt-1">
      <Icon name="shield-check" size={16} color={() => 0x255c48} />
      <Text className={`text-[12px] font-semibold ${INK}`}>Conserver le SysCFG actuel</Text>
    </View>
    <Text className={`text-[11px] ${MUTED}`} numberOfLines={3}>Aucun retour automatique à l’identité d’usine, aucun remplacement par le firmware le plus récent.</Text>
    <Action label="Inspecter un fichier IPSW…" icon="file-search" disabled={busy() || !ready()} onPress={() => { inspectArchive(); }} />
    {f() !== null ? <View className="flex-col gap-1 p-3 rounded-[6] bg-[#eceee7]">
      <Text className={`text-[12px] font-semibold ${INK}`} numberOfLines={1}>{(f() as Firmware).name}</Text>
      <Text className={`text-[10px] ${MUTED}`}>{'' + (f() as Firmware).entries + ' entrées · ' + ((f() as Firmware).size / 1048576).toFixed(1) + ' Mo'}</Text>
      <Text className={`text-[10px] select-text ${MUTED}`} numberOfLines={2}>{'SHA256 ' + (f() as Firmware).sha256}</Text>
      <Text className="text-[11px] text-[#946426]" numberOfLines={4}>{(f() as Firmware).warning}</Text>
    </View> : <Text className={`text-[11px] ${MUTED}`} numberOfLines={3}>L’inspection vérifie la structure et l’intégrité de l’archive. Elle n’autorise jamais un flash sur la seule foi du nom de fichier.</Text>}
    <Action label="Établir le plan de secours" icon="list-checks" disabled={busy() || selected() === null} onPress={makePlan} />
  </View>;
}
function StepRow(props: { step: RecoveryStep; index: i32 }): i32 {
  const s = props.step;
  return <View className="flex-row items-center gap-3 py-1.5">
    <View className={`w-[24] h-[24] rounded-full items-center justify-center ${s.status === 'verified' ? 'bg-[#255c48]' : s.status === 'failed' ? 'bg-[#a13c30]' : s.status === 'running' ? 'bg-[#e8ba62]' : 'bg-[#e8ebe2]'}`}>
      <Text className={`text-[10px] font-semibold ${s.status === 'verified' || s.status === 'failed' ? 'text-white' : INK}`}>{s.status === 'verified' ? '✓' : s.status === 'failed' ? '!' : '' + (props.index + 1)}</Text>
    </View>
    <Text className={`text-[12px] ${s.status === 'pending' ? MUTED : INK}`}>{s.title}</Text>
  </View>;
}
function Workflow(): i32 {
  const p = (): RecoveryPlan | null => recoveryPlan();
  return <View className="flex-col gap-3">
    <View className="flex-row items-center gap-2">
      <Icon name="route" size={17} color={() => 0x255c48} />
      <Text className={`text-[16px] font-bold ${INK}`}>Parcours de récupération</Text>
    </View>
    {mode() === 'simulation' ? <Action label={busy() ? 'Opération en cours…' : 'Répéter sur un appareil fictif'} primary={true} icon="play" disabled={busy() || selected() === null} onPress={() => { rehearse(); }} /> : <View />}
    <View className="flex-col">{workflow().map((s: RecoveryStep, i: i32) => <StepRow step={s} index={i} />)}</View>
    {p() !== null ? <View className={`flex-col gap-2 pt-3 border-t ${BORDER}`}>
      <Text className={`text-[12px] font-semibold ${INK}`}>{(p() as RecoveryPlan).filesystem + ' · firmware ' + (p() as RecoveryPlan).firmware}</Text>
      {(p() as RecoveryPlan).blockers.map((s: string) => <Text className="text-[11px] text-[#946426]" numberOfLines={3}>{'Blocage : ' + s}</Text>)}
      <Text className={`text-[10px] select-text ${MUTED}`} numberOfLines={2}>{'Plan SHA256 : ' + (p() as RecoveryPlan).sha256.slice(0, 20) + '…'}</Text>
    </View> : <View />}
    {mode() === 'simulation' ? <View className="flex-col gap-3 pt-2">
      <Text className={`text-[11px] font-semibold ${MUTED}`}>INJECTER UNE PANNE</Text>
      <View className="flex-row flex-wrap gap-1.5">{FAULT_IDS.map((id: string, i: i32) => <Choice label={FAULT_LABELS[i]} active={fault() === id} disabled={busy()} onPress={() => setFault(id)} />)}</View>
    </View> : <View className="p-3 bg-[#f4ead7] rounded-[7] flex-col gap-1">
      <Text className="text-[12px] text-[#835c27] font-semibold">Restauration matérielle indisponible</Text>
      <Text className="text-[11px] text-[#835c27]" numberOfLines={4}>Le transport USB / SCSI Mac n’est pas qualifié. Cette démo n’exécute aucun effacement ni flash sur un iPod réel.</Text>
    </View>}
  </View>;
}
export function RescuePanel(): i32 {
  return <View className={`flex-col h-full bg-[#f3f2ec] ${INK}`}>
    <View className={`flex-row items-center gap-4 px-6 h-[72] shrink-0 border-b ${BORDER} bg-[#fffef9]`}>
      <View className="w-[35] h-[35] bg-[#255c48] rounded-[9] items-center justify-center"><Icon name="life-buoy" size={23} color={() => 0xffffff} /></View>
      <View className="grow flex-col gap-0.5"><Text className={`text-[20px] font-bold ${INK}`}>iPod · Atelier de secours</Text><Text className={`text-[11px] ${MUTED}`}>IDENTIFIER / PRÉPARER / RÉCUPÉRER / VÉRIFIER</Text></View>
      <Choice label="Appareils réels" active={mode() === 'hardware'} disabled={busy()} onPress={() => chooseMode('hardware')} />
      <Choice label="Simulation" active={mode() === 'simulation'} disabled={busy()} onPress={() => chooseMode('simulation')} />
    </View>
    <View className="flex-row grow basis-0 min-h-0">
      <View className={`w-[220] shrink-0 flex-col gap-4 p-4 border-r ${BORDER} bg-[#eaece3]`}>
        <View className="flex-row items-center gap-2"><Text className={`grow text-[11px] font-semibold ${MUTED}`}>APPAREILS</Text><Icon name="usb" size={14} color={() => 0x64756e} /></View>
        <Action label="Actualiser" icon="refresh-cw" disabled={busy() || !ready()} onPress={scan} />
        <ScrollView className="grow min-h-0"><View className="flex-col gap-2">
          {devices().map((d: Device) => <DeviceRow device={d} />)}
          {devices().length === 0 ? <Text className={`text-[12px] ${MUTED}`} numberOfLines={5}>{busy() ? 'Recherche en cours…' : 'Aucun iPod identifié. Le simulateur permet de découvrir le parcours sans appareil.'}</Text> : <View />}
        </View></ScrollView>
        <View className={`flex-col gap-1.5 py-3 border-t ${BORDER}`}><Icon name="shield-check" size={19} color={() => 0x255c48} />
          <Text className={`text-[12px] font-bold ${INK}`}>{mode() === 'simulation' ? 'SIMULATION EXPLICITE' : 'LECTURE SEULE'}</Text>
          <Text className={`text-[11px] ${MUTED}`} numberOfLines={4}>Le SysCFG n’est jamais corrigé automatiquement. Une identité déclarée ne prouve pas la carte physique.</Text>
        </View>
      </View>
      <View className="grow basis-0 min-w-0 flex-col">
        <ScrollView className="grow min-h-0"><View className="flex-col gap-5 p-6">
          <View className={`px-4 py-3 rounded-[8] border ${mode() === 'simulation' ? 'bg-[#e0eddf] border-[#b3c8ae]' : 'bg-[#f4ead7] border-[#e1cda7]'}`}>
            <Text className={`text-[12px] font-semibold ${INK}`} numberOfLines={3}>{mode() === 'simulation' ? 'Répétition complète sur fichiers locaux — aucun formatage matériel, aucune image Apple exécutée.' : 'Diagnostic réel sur Mac. Les opérations d’effacement et de firmware restent verrouillées.'}</Text>
          </View>
          <View className="flex-row gap-5 items-start">
            <View className={`grow basis-0 min-w-0 flex-col gap-5 p-5 rounded-[10] border ${BORDER} ${CARD}`}>
              <Text className={`text-[16px] font-bold ${INK}`}>01 / Diagnostic & préparation</Text>
              {selected() !== null ? <DeviceDetails device={selected() as Device} /> : <Text className={`text-[13px] ${MUTED}`}>Choisir un appareil dans la liste.</Text>}
              <View className={`h-[1] ${BORDER} border-t`} /><Preparation />
            </View>
            <View className={`w-[310] flex-col p-5 rounded-[10] border ${BORDER} ${CARD}`}><Workflow /></View>
          </View>
        </View></ScrollView>
        <View className={`px-6 py-3 shrink-0 border-t ${BORDER} ${failed() ? 'bg-[#f4e1da]' : 'bg-[#e8ede2]'}`}>
          <Text className={`text-[12px] ${failed() ? 'text-[#963e30]' : INK}`} numberOfLines={3}>{notice()}</Text>
          {artifact() !== '' ? <Button onClick={revealArtifact} className="mt-1"><Text className="text-[11px] text-[#255c48] font-semibold">Afficher le résultat dans Finder →</Text></Button> : <View />}
        </View>
      </View>
    </View>
    <View className="h-[200] shrink-0 bg-[#182a25] flex-col">
      <View className="flex-row gap-3 items-center px-5 h-[43] border-b border-[#35433b] shrink-0">
        <Text className="grow text-[11px] font-semibold text-[#d4dfce]">JOURNAL TECHNIQUE / SESSION LOCALE</Text>
        <Action label="Dossier de session" disabled={!ready()} onPress={revealSession} />
        <Action label="Exporter le support expurgé" disabled={busy() || !ready()} onPress={exportLogs} />
      </View>
      <ScrollView className="grow min-h-0"><View className="px-5 py-2 flex-col gap-1">
        {logs().map((e: LogEntry) => <View className="flex-row gap-3"><Text className="w-[48] text-[10px] text-[#819d8a] font-mono">{e.elapsed + 's'}</Text><Text className={`w-[70] text-[10px] font-mono ${e.level === 'error' ? 'text-[#efa88f]' : 'text-[#9fbc9c]'}`}>{e.stage}</Text><View className="grow basis-0 flex-col gap-0.5"><Text className={`text-[11px] select-text font-mono ${e.level === 'error' ? 'text-[#efa88f]' : 'text-[#d4dfce]'}`} numberOfLines={3}>{e.message}</Text>{e.detail !== '' ? <Text className="text-[10px] text-[#819d8a] font-mono select-text" numberOfLines={3}>{e.detail}</Text> : <View />}</View></View>)}
      </View></ScrollView>
    </View>
  </View>;
}
