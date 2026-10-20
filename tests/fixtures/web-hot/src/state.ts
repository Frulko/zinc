// The state of the fixture: a counter that a hot update of Label.tsx must keep.
import { createSignal } from 'zinc:ui/solid';

export const [count, setCount] = createSignal<number>(0);
