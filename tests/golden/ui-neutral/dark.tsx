// The primitives on a dark window: their text is white (tests/t1/ui_neutral.sh).
import { render } from 'zinc:ui/solid';
import { App, script } from './app';

script();
render(App, 0x111827, (dt: number) => {});
