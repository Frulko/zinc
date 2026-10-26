// What the hub is doing now, for the modal of main.tsx: the action's title and its current step. The services say their steps here.
import { createSignal } from 'zinc:ui/solid';

export const [task, setTask] = createSignal<string>('');
export const [step, setStep] = createSignal<string>('');
/** Set when the action failed: the modal shows it with OK instead of closing. */
export const [failure, setFailure] = createSignal<string>('');

export function progress(s: string): void { setStep(s); console.log('hub: · ' + s); }
