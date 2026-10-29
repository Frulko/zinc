// Backups and the iPod's health: the backups on the computer (date, tracks, size, with the music or not, taken by hand or
// automatically before a session's first change), back up now, restore and delete (behind Allow changes, after a question),
// check and repair, and eject.
import { onMount } from 'zinc:ui/solid';
import { Icon } from 'zinc:icons';
import * as ipod from 'zinc:ipod';
import { library, allowChanges } from '../../state';
import { PodLibrary } from '../../services/ipod';
import { backupPlace } from '../../services/log';
import { backupList, refreshBackups, backupNow, restore, deleteBackup, health, checkPod, repairPod, ejectPod, notice, remoteOpen } from '../../actions';
import { Button } from '../../components/Button';
import { bytes, count } from '../../format';
import { bg, bd, fg, color, CARD, BORDER, TEXT, MUTED, FAINT, ACCENT, ACCENT_SOFT, ERROR, REMOTE_LOCAL_ONLY } from '../../constants';

function pad2(n: number): string { return n < 10 ? `0${n}` : `${n}`; }
/** Unix seconds as 'YYYY-MM-DD HH:MM'. */
function when(s: number): string {
  if (s <= 0) return '—';
  const d = new Date(s * 1000);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function Badge(props: { label: string }): i32 {
  return <View className={`px-2 py-0.5 rounded-full ${bg(ACCENT_SOFT)}`}><Text className={`text-[10px] font-semibold ${fg(ACCENT)}`}>{props.label}</Text></View>;
}

function BackupRow(props: { b: ipod.Backup }): i32 {
  const b = props.b, locked = (): boolean => !allowChanges();
  return <View className={`flex-row items-center gap-3 px-4 py-2.5 border-t ${bd(BORDER)}`}>
    <Icon name="archive" size={16} color={() => color(MUTED)} strokeWidth={2} />
    <View className="grow basis-0 flex-col gap-0.5 min-w-0">
      <View className="flex-row items-center gap-2">
        <Text className={`text-[13px] font-semibold ${fg(TEXT)}`}>{when(b.created)}</Text>
        {b.auto ? <Badge label="Automatic" /> : <View />}
        {b.music ? <Badge label="With music" /> : <View />}
      </View>
      <Text className={`text-[11px] ${fg(MUTED)}`} numberOfLines={1}>{`${b.name !== '' ? b.name : 'iPod'} · ${count(b.tracks, 'track', 'tracks')} · ${bytes(b.bytes)} · ${b.folder}`}</Text>
    </View>
    <Button icon="rotate-ccw" label="Restore" disabled={locked() || remoteOpen()} onPress={() => { restore(b); }} />
    <Button icon="x" label="Delete" danger={true} disabled={locked()} onPress={() => { deleteBackup(b); }} />
  </View>;
}

function HealthCard(): i32 {
  const c = (): ipod.Check | null => health();
  const line = (): string => {
    const h = c();
    if (h === null) return 'Not checked yet: Check looks for tracks whose file is gone and files no track uses';
    const k = h as ipod.Check;
    if (k.missing.length === 0 && k.orphans.length === 0) return 'Everything is in order';
    return `${count(k.missing.length, 'track', 'tracks')} without a file, ${count(k.orphans.length, 'file', 'files')} no track uses (${bytes(k.orphanBytes)})`;
  };
  return <View className={`flex-row items-center gap-3 px-4 py-3 rounded-[10] border ${bg(CARD)} ${bd(BORDER)}`}>
    <Icon name="stethoscope" size={18} color={() => color(ACCENT)} strokeWidth={2} />
    <View className="grow basis-0 flex-col min-w-0">
      <Text className={`text-[13px] font-semibold ${fg(TEXT)}`}>Health</Text>
      <Text className={`text-[12px] ${fg(MUTED)}`}>{line()}</Text>
    </View>
    <Button icon="shield-check" label="Check" disabled={remoteOpen()} onPress={checkPod} />
    <Button icon="wrench" label="Repair" disabled={!allowChanges() || remoteOpen()} onPress={() => { repairPod(); }} />
    <Button icon="eject" label="Eject" onPress={() => { ejectPod(); }} />
  </View>;
}

export function BackupsPage(): i32 {
  onMount(() => { refreshBackups(); });
  const mine = (): ipod.Backup[] => {
    const l = library(), out: ipod.Backup[] = [];
    if (l === null) return out;
    const serial = (l as PodLibrary).device.serial;
    for (const b of backupList()) if (serial === '' || b.serial === serial) out.push(b);
    return out;
  };
  return <ScrollView className="grow">
    <View className="flex-col gap-6 px-10 py-8">
      <View className="flex-row items-end gap-2">
        <View className="grow basis-0 flex-col min-w-0">
          <Text className={`text-[26px] font-bold ${fg(TEXT)}`}>Backups</Text>
          <Text className={`text-[13px] ${fg(MUTED)}`} numberOfLines={1}>{`On this computer, in ${backupPlace()}`}</Text>
        </View>
        <Button icon="archive" label="Back up now" accent={!remoteOpen()} disabled={remoteOpen()} onPress={() => backupNow(false)} />
        <Button icon="archive" label="With the music" disabled={remoteOpen()} onPress={() => backupNow(true)} />
      </View>
      <View className="flex-col gap-2">
        <View className={`flex-row items-center gap-2.5 px-4 py-3 rounded-[10] border ${allowChanges() ? bd(ERROR) : bd(BORDER)}`}>
          <Icon name={allowChanges() ? 'lock-open' : 'lock'} size={16} color={() => color(allowChanges() ? ERROR : MUTED)} strokeWidth={2} />
          <Text className={`grow basis-0 text-[12px] ${fg(TEXT)}`}>{remoteOpen()
            ? `A remote iPod: backups, check and repair are ${REMOTE_LOCAL_ONLY}. Eject asks the daemon.`
            : allowChanges()
            ? 'Changes are allowed. Before the first change of this session, zinc:ipod backs the database up here by itself (an Automatic backup).'
            : 'Read only: restoring, repairing and deleting a backup need Allow changes (in the sidebar). Backing up only reads the iPod.'}</Text>
        </View>
        {notice() !== '' ? <Text className={`text-[12px] ${fg(ERROR)}`}>{notice()}</Text> : <View />}
      </View>
      <View className={`flex-col rounded-[10] border overflow-hidden ${bg(CARD)} ${bd(BORDER)}`}>
        <Text className={`text-[12px] font-semibold px-4 py-2 ${fg(MUTED)}`}>{mine().length === 0 ? 'No backup of this iPod yet' : count(mine().length, 'backup', 'backups')}</Text>
        {mine().map((b: ipod.Backup) => <BackupRow b={b} />)}
      </View>
      <HealthCard />
      <Text className={`text-[11px] ${fg(FAINT)}`}>The backups of one iPod share their music folder: a backup with the music copies only what is new.</Text>
    </View>
  </ScrollView>;
}
