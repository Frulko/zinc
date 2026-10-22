// The primitives on a light window: their text is black (tests/t1/ui_neutral.sh).
import { render } from 'zinc:ui/solid';
import { App, script } from './app';

script();
render(App, 0xffffff, (dt: number) => {});
