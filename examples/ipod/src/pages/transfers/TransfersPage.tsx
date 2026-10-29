// The transfers: every job of the session (add, download, backup, restore, delete, check, repair), the one running with its
// progress bar and the file it copies, those waiting with Cancel, those ended with their result (a click lists each file: its tags as
// the iPod holds them or why it was refused, and its size; and every step the job took, shown live while it runs); and where downloads go.
import { Icon } from 'zinc:icons';
import * as ui from 'zinc:ui';
import { createSignal, onCleanup } from 'zinc:ui/solid';
import { jobs, cancel, clearFinished, transfersSeen, iconOf, Job, JobLine, WAITING, RUNNING, DONE, FAILED } from '../../services/transfers';
import { downloadFolder, chooseDownloadDir } from '../../actions';
import { Button } from '../../components/Button';
import { bytes } from '../../format';
import { bg, bd, fg, color, CARD, BORDER, HOVER, TEXT, MUTED, FAINT, ACCENT, ERROR, TRACK, SIDEBAR as LOG_BG } from '../../constants';

function Line(props: { l: JobLine }): i32 {
  return <View className="flex-row items-start gap-2">
    <Icon name={props.l.ok ? 'check' : 'x'} size={12} color={() => color(props.l.ok ? MUTED : ERROR)} strokeWidth={2.5} />
    <Text className={`grow basis-0 min-w-0 text-[12px] ${props.l.ok ? fg(TEXT) : fg(ERROR)}`}>{props.l.text}</Text>
    {props.l.size >= 0 ? <Text className={`text-[11px] ${fg(MUTED)}`}>{bytes(props.l.size)}</Text> : <View />}
  </View>;
}

function JobRow(props: { job: Job }): i32 {
  const j = props.job;
  const state = (): string => j.status();
  // open while it runs (its steps scroll by), closed when it ends, until a click decides
  const [chosen, setChosen] = createSignal<i32>(-1);
  const open = (): boolean => chosen() >= 0 ? chosen() === 1 : state() === RUNNING;
  const has = (): boolean => j.lines().length > 0 || j.events() !== '';
  return <View className={`flex-col border-t ${bd(BORDER)}`}>
  <View className={`flex-row items-center gap-3 px-4 py-3 ${has() ? `cursor-pointer hover:${bg(HOVER)}` : ''}`}
    onPointerDown={(e: ui.PointerEvent) => { if (has()) setChosen(open() ? 0 : 1); }}>
    <Icon name={has() ? (open() ? 'chevron-down' : 'chevron-right') : 'dot'} size={14} color={() => color(FAINT)} strokeWidth={2} />
    <Icon name={iconOf(j.kind)} size={16} color={() => color(state() === FAILED ? ERROR : ACCENT)} strokeWidth={2} />
    <View className="grow basis-0 flex-col gap-1 min-w-0">
      <Text className={`text-[13px] font-semibold ${fg(TEXT)}`} numberOfLines={1}>{j.label}</Text>
      {state() === RUNNING ? <View className={`h-[5] w-[360] rounded-full overflow-hidden ${bg(TRACK)}`}>
        <View className={`h-full ${bg(ACCENT)}`} style={{ width: Math.round(Math.max(0.02, j.fraction()) * 360) }} />
      </View> : <View />}
      <Text className={`text-[12px] ${state() === FAILED ? fg(ERROR) : fg(MUTED)}`} numberOfLines={2}>{j.summary()}</Text>
    </View>
    {state() === WAITING ? <Button icon="x" label="Cancel" onPress={() => cancel(j)} />
      : <Text className={`text-[11px] font-semibold ${state() === FAILED ? fg(ERROR) : state() === DONE ? fg(MUTED) : fg(FAINT)}`}>{state()}</Text>}
  </View>
  {open() && j.lines().length > 0 ? <View className="flex-col gap-1.5 pl-[62] pr-4 pb-3">{j.lines().map((l: JobLine) => <Line l={l} />)}</View> : <View />}
  {open() && j.events() !== '' ? <View className="flex-col gap-1 pl-[62] pr-4 pb-3">
    <Text className={`text-[11px] font-semibold ${fg(FAINT)}`}>STEPS</Text>
    <ScrollView stickToBottom className={`h-[200] rounded-[6] border px-3 py-2 ${bg(LOG_BG)} ${bd(BORDER)}`}>
      <Text className={`font-mono text-[11px] whitespace-pre-wrap ${fg(MUTED)}`}>{j.events()}</Text>
    </ScrollView>
  </View> : <View />}
  </View>;
}

export function TransfersPage(): i32 {
  // what is shown here needs no toast, and a failure listed here is seen (the sidebar's red dot goes): on arriving and on leaving
  transfersSeen();
  onCleanup(transfersSeen);
  const shown = (): Job[] => { const out: Job[] = []; const all = jobs(); for (let i = all.length - 1; i >= 0; i--) out.push(all[i]); return out; };
  return <ScrollView className="grow">
    <View className="flex-col gap-6 px-10 py-8">
      <View className="flex-row items-end gap-3">
        <View className="grow flex-col">
          <Text className={`text-[26px] font-bold ${fg(TEXT)}`}>Transfers</Text>
          <Text className={`text-[13px] ${fg(MUTED)}`}>One job at a time; those not started yet can be cancelled</Text>
        </View>
        <Button icon="list-checks" label="Clear finished" onPress={clearFinished} />
      </View>
      <View className={`flex-row items-center gap-3 px-4 py-3 rounded-[10] border ${bg(CARD)} ${bd(BORDER)}`}>
        <Icon name="folder-open" size={16} color={() => color(MUTED)} strokeWidth={2} />
        <View className="grow basis-0 flex-col min-w-0">
          <Text className={`text-[11px] font-semibold ${fg(FAINT)}`}>DOWNLOADS GO TO</Text>
          <Text className={`text-[13px] ${fg(TEXT)}`} numberOfLines={1}>{downloadFolder()}</Text>
        </View>
        <Button icon="folder-open" label="Change…" onPress={() => { chooseDownloadDir(); }} />
      </View>
      <View className={`flex-col rounded-[10] border overflow-hidden ${bg(CARD)} ${bd(BORDER)}`}>
        <Text className={`text-[12px] font-semibold px-4 py-2 ${fg(MUTED)}`}>{jobs().length === 0 ? 'Nothing yet: downloads, adds, backups and restores show here' : `${jobs().length} this session`}</Text>
        {shown().map((j: Job) => <JobRow job={j} />)}
      </View>
    </View>
  </ScrollView>;
}
