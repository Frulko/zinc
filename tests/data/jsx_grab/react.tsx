import { useState, MutableRef, render } from 'zinc:ui/react';
import { policies, read, down, cancel, verify } from './probe';

const area = new MutableRef<i32>(-1);
let setPolicy: (v: string) => void = (v: string) => {};
function App(): i32 {
  const [policy, change] = useState<string>(policies[0]);
  setPolicy = change;
  return <ScrollView ref={area} className="w-[200px] h-[200px]">
    <View className="w-[200px] h-[600px]" grab={read(policy)} onPointerDown={down} onPointerCancel={cancel} />
  </ScrollView>;
}
let frame: i32 = 0;
render(App, 0xffffff, (dt: number) => {
  frame++;
  const step = frame - 2;
  if (step < 0 || step >= policies.length) return;
  verify(area.current, step);
  if (step + 1 < policies.length) setPolicy(policies[step + 1]);
});
