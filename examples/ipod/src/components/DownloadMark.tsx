// The arrow at the end of a track's row: a download arrow, a ring of the track's download while it waits or runs, a check once it is on the
// computer, a red x when it failed (a click tries again).
import { Icon } from 'zinc:icons';
import { ProgressRing } from 'zinc:ui/kit';
import { latestJob, Job, DONE, FAILED } from '../services/transfers';
import { color, FAINT, ACCENT, ERROR, TRACK } from '../constants';

export function DownloadMark(props: { id: () => string }): i32 {
  const job = (): Job | null => props.id() !== '' ? latestJob(`track:${props.id()}`) : null;
  const state = (): string => { const j = job(); return j === null ? '' : (j as Job).active() ? 'busy' : (j as Job).status(); };
  return <View className="w-[13] h-[13]">{state() === 'busy'
    ? <ProgressRing value={() => { const j = job(); return j !== null ? (j as Job).fraction() * 100 : 0; }} size={13} color={() => color(ACCENT)} track={() => color(TRACK)} strokeWidth={4} />
    : state() === DONE ? <Icon name="check" size={13} color={() => color(ACCENT)} strokeWidth={2.5} />
    : state() === FAILED ? <Icon name="x" size={13} color={() => color(ERROR)} strokeWidth={2.5} />
    : <Icon name="download" size={13} color={() => color(FAINT)} strokeWidth={2} />}</View>;
}
