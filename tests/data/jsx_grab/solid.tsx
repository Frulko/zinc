import { createSignal, createNodeRef, render } from 'zinc:ui/solid';
import { policies, read, down, cancel, verify } from './probe';

const area = createNodeRef();
const [policy, setPolicy] = createSignal<string>(policies[0]);
function App(): i32 {
  return <ScrollView ref={area} className="w-[200px] h-[200px]">
    <View className="w-[200px] h-[600px]" grab={read(policy())} onPointerDown={down} onPointerCancel={cancel} />
  </ScrollView>;
}
let frame: i32 = 0;
render(App, 0xffffff, (dt: number) => {
  frame++;
  const step = frame - 2;
  if (step < 0 || step >= policies.length) return;
  verify(area.node, step);
  if (step + 1 < policies.length) setPolicy(policies[step + 1]);
});
