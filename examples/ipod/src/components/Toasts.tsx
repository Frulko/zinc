// The last three jobs use kit-owned live toast handles; the queue remains the source of truth.
import { createEffect, onCleanup } from 'zinc:ui/solid';
import { toast, ToastAction } from 'zinc:ui/kit';
import * as sys from 'zinc:sys';
import { reveal } from 'zinc:system/opener';
import { toasts, dismissToast, cancel, requestJobReveal, Job, WAITING, RUNNING, FAILED } from '../services/transfers';
import { showPage } from '../state';
import { PAGE_TRANSFERS, TOAST_SHOWN, TOAST_MS } from '../constants';

function short(text: string): string { const home = sys.env('HOME'); return home !== '' ? text.split(home).join('~') : text; }

function Toast(props: { job: Job }): i32 {
  const j = props.job;
  const handle = toast(j.label, short(j.summary()), -1, { expanded: true, onDismiss: () => dismissToast(j) });
  onCleanup(handle.close);
  createEffect(() => {
    const status = j.status();
    const actions: ToastAction[] = [];
    if (status === WAITING || (status === RUNNING && j.stop !== null)) actions.push({ label: 'Cancel', onAction: () => cancel(j), dismiss: false });
    if (!j.active() && status !== FAILED && j.reveal !== '') actions.push({ label: 'Reveal in Finder', onAction: () => { reveal(j.reveal); }, dismiss: false });
    if (j.queued) actions.push({ label: status === FAILED ? 'Show details' : 'Show', onAction: () => { requestJobReveal(j.id); showPage(PAGE_TRANSFERS); }, dismiss: false });
    handle.update({ tone: status === FAILED ? 'error' : 'default', actions: actions, duration: j.active() || status === FAILED ? -1 : TOAST_MS });
  });
  createEffect(() => handle.update({ title: j.label, description: short(j.summary()), progress: j.status() === RUNNING ? j.fraction() * 100 : -1 }));
  return <View />;
}

function More(props: { count: () => i32 }): i32 {
  const handle = toast(`+${props.count()} more`, '', -1, { expanded: true, actions: [{ label: 'Show all transfers', onAction: () => showPage(PAGE_TRANSFERS), dismiss: false }] });
  createEffect(() => handle.update({ title: `+${props.count()} more` }));
  onCleanup(handle.close);
  return <View />;
}

export function Toasts(): i32 {
  const shown = (): Job[] => { const all = toasts(); return all.slice(Math.max(0, all.length - TOAST_SHOWN)); };
  const more = (): i32 => Math.max(0, toasts().length - TOAST_SHOWN);
  return <View>
    {shown().map((j: Job) => <Toast job={j} />)}
    {more() > 0 ? <More count={more} /> : <View />}
  </View>;
}
