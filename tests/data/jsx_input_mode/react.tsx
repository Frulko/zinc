import { useState, MutableRef, render } from 'zinc:ui/react';
import { modes, read, verify } from './probe';

const field = new MutableRef<i32>(-1);
let setMode: (v: string) => void = (v: string) => {};
function App(): i32 {
  const [mode, change] = useState<string>(modes[0]);
  setMode = change;
  return <Input ref={field} inputMode={read(mode)} value="abc123" />;
}
let frame: i32 = 0;
render(App, 0xffffff, (dt: number) => {
  frame++;
  const step = frame - 2;
  if (step < 0 || step >= modes.length) return;
  verify(field.current, step);
  if (step + 1 < modes.length) setMode(modes[step + 1]);
});
