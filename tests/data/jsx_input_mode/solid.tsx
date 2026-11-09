import { createSignal, createNodeRef, render } from 'zinc:ui/solid';
import { modes, read, verify } from './probe';

const field = createNodeRef();
const [mode, setMode] = createSignal<string>(modes[0]);
function App(): i32 { return <Input ref={field} inputMode={read(mode())} value="abc123" />; }
let frame: i32 = 0;
render(App, 0xffffff, (dt: number) => {
  frame++;
  const step = frame - 2;
  if (step < 0 || step >= modes.length) return;
  verify(field.node, step);
  if (step + 1 < modes.length) setMode(modes[step + 1]);
});
