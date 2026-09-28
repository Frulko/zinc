// UI state shared by the panels: the centre tab, the open dialog and a short status message.
import { createSignal } from 'zinc:ui/solid';

const [tabSig, setTabSig] = createSignal<string>('Flow');
const [dialogSig, setDialogSig] = createSignal<string>('');
const [toastSig, setToastSig] = createSignal<string>('');
let toastTimer = -1;

/** Centre tab: Flow | Script | Generated code | Docs. */
export function centerTab(): string { return tabSig(); }
export function setCenterTab(t: string): void { setTabSig(t); }
/** Open dialog: '' | open | new | devices. */
export function dialog(): string { return dialogSig(); }
export function openDialog(d: string): void { setDialogSig(d); }
export function closeDialog(): void { setDialogSig(''); }
/** A message shown for 3 s in the status bar. */
export function toast(): string { return toastSig(); }
export function notify(msg: string): void {
  setToastSig(msg);
  if (toastTimer >= 0) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toastTimer = -1; setToastSig(''); }, 3000);
}
