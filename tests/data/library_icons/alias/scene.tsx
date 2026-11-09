import { render, createSignal } from 'zinc:ui/solid';
import { Icon } from 'zinc:icons';
const [old, setOld] = createSignal(true);
const App = (): i32 => <Icon name={old() ? 'trash-2' : 'heart'} />;
render(App, 0xffffff, null);
