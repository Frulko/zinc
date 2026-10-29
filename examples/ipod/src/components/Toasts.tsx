// What the transfers are doing, wherever the owner is (as the Finder and Music show a copy, and Nuxt UI's toasts): a toast at the bottom right for
// each job from the moment it is queued, its progress live, Show (the Transfers page) and Cancel while it waits; when it ends, its result with
// Reveal in Finder (a download, a backup) or, red, the sentence of its failure with Show details. An ended toast fades after a few seconds
// unless the pointer is on it; a failure stays until closed. The last three show, the others as "+N more". Not drawn on the Transfers page,
// which shows it all. Drawn over the page by main.tsx.
import * as ui from 'zinc:ui';
import { createEffect, createNodeRef, onCleanup, animate, after } from 'zinc:ui/solid';
import { Icon } from 'zinc:icons';
import * as sys from 'zinc:sys';
import { reveal } from 'zinc:system/opener';
import { toasts, dismissToast, cancel, iconOf, Job, WAITING, RUNNING, FAILED } from '../services/transfers';
import { showPage } from '../state';
import { bg, bd, fg, color, CARD, BORDER, HOVER, TEXT, MUTED, FAINT, ACCENT, ERROR, TRACK, PAGE_TRANSFERS, TOAST_WIDTH, TOAST_SHOWN, TOAST_MS } from '../constants';

/** A path with the home folder as ~. */
function short(text: string): string { const home = sys.env('HOME'); return home !== '' ? text.split(home).join('~') : text; }

function Link(props: { label: string; onPress: () => void }): i32 {
  return <View className="py-0.5 mr-3 cursor-pointer" onPointerDown={(e: ui.PointerEvent) => props.onPress()}>
    <Text className={`text-[12px] font-semibold ${fg(ACCENT)}`}>{props.label}</Text>
  </View>;
}

function Toast(props: { job: Job }): i32 {
  const j = props.job, ref = createNodeRef();
  let hovered = false, gone = false, fading = false;
  onCleanup(() => { gone = true; });
  // ended well (or cancelled): fade after a few seconds, later while the pointer is on it
  createEffect(() => {
    const s = j.status();
    if (s === WAITING || s === RUNNING || s === FAILED || fading) return;
    fading = true;
    (async (): Promise<void> => {
      await after(TOAST_MS);
      while (hovered && !gone) await after(500);
      if (gone) return;
      await animate(ref, 'opacity', 0, { dur: 250 });
      dismissToast(j);
    })();
  });
  const failed = (): boolean => j.status() === FAILED;
  const icon = (): string => failed() ? 'circle-x' : j.active() ? iconOf(j.kind) : 'circle-check';
  return <View ref={ref} className={`flex-row gap-3 p-3 rounded-[10] border shadow-lg ${bg(CARD)} ${failed() ? bd(ERROR) : bd(BORDER)}`} role="status"
    onPointerEnter={(e: ui.PointerEvent) => { hovered = true; }} onPointerLeave={(e: ui.PointerEvent) => { hovered = false; }}>
    <Icon name={icon()} size={18} color={() => color(failed() ? ERROR : ACCENT)} strokeWidth={2} />
    <View className="grow basis-0 flex-col gap-1 min-w-0">
      <Text className={`text-[13px] font-semibold ${fg(TEXT)}`} numberOfLines={1}>{j.label}</Text>
      {j.status() === RUNNING ? <View className={`h-[4] rounded-full overflow-hidden ${bg(TRACK)}`}>
        <View className={`h-full ${bg(ACCENT)}`} style={{ widthPercent: Math.max(0.02, j.fraction()) }} />
      </View> : <View />}
      <Text className={`text-[12px] ${failed() ? fg(ERROR) : fg(MUTED)}`} numberOfLines={3}>{short(j.summary())}</Text>
      <View className="flex-row">
        {j.status() === WAITING || (j.status() === RUNNING && j.stop !== null) ? <Link label="Cancel" onPress={() => cancel(j)} /> : <View />}
        {!j.active() && !failed() && j.reveal !== '' ? <Link label="Reveal in Finder" onPress={() => { reveal(j.reveal); }} /> : <View />}
        {j.queued ? <Link label={failed() ? 'Show details' : 'Show'} onPress={() => showPage(PAGE_TRANSFERS)} /> : <View />}
      </View>
    </View>
    <View className={`self-start p-0.5 rounded-full cursor-pointer hover:${bg(HOVER)}`} onPointerDown={(e: ui.PointerEvent) => dismissToast(j)}>
      <Icon name="x" size={13} color={() => color(FAINT)} strokeWidth={2} />
    </View>
  </View>;
}

export function Toasts(): i32 {
  const shown = (): Job[] => { const all = toasts(); return all.slice(Math.max(0, all.length - TOAST_SHOWN)); };
  const more = (): i32 => Math.max(0, toasts().length - TOAST_SHOWN);
  return <View className="absolute right-4 bottom-4 flex-col gap-2" style={{ width: TOAST_WIDTH }}>
    {more() > 0 ? <View className={`self-end px-2.5 py-1 rounded-full border cursor-pointer ${bg(CARD)} ${bd(BORDER)}`} onPointerDown={(e: ui.PointerEvent) => showPage(PAGE_TRANSFERS)}>
      <Text className={`text-[11px] font-semibold ${fg(MUTED)}`}>{`+${more()} more`}</Text>
    </View> : <View />}
    {shown().map((j: Job) => <Toast job={j} />)}
  </View>;
}
