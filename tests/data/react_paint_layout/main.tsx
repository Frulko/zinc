import * as ui from 'zinc:ui';
import { render, useState } from 'zinc:ui/react';
import { quit } from 'zinc:gfx';
import { Icon } from 'zinc:icons';
let update: (v: number) => void = (v: number): void => {};
function Child(): i32 { return <View><Text>stable child</Text><Icon name="hand" size={12} /></View>; }
function kids(children: (() => i32) | undefined): i32 { return children !== undefined ? children() : -1; }
function Panel(p: { children?: () => i32 }): i32 { return <View><Text>heading</Text><View>{kids(p.children)}</View><Text>note</Text></View>; }
function App(): i32 {
  const [step, setStep] = useState(0); update = setStep;
  return <Panel><View style={{ width: step >= 3 ? 250 : 200, height: 160 }}>
    <View style={{ width: 100, height: 40, translateX: step * 2, backgroundColor: step >= 2 ? 0xff0000 : 0x00ff00 }}><Child /></View>
    {[0, 1, 2].map((n: number) => <View style={{ height: 15 }}><Child /></View>)}
    {step >= 4 && <Text>new child</Text>}
  </View></Panel>;
}
let frame = 0, layouts = 0;
render(App, 0xffffff, (dt: number): void => {
  frame++;
  if (frame === 3) { layouts = ui.layoutCount(); update(1); }
  if (frame === 5) { console.log('translation', ui.layoutCount() === layouts); update(2); }
  if (frame === 7) { console.log('colour', ui.layoutCount() === layouts); update(3); }
  if (frame === 9) { console.log('size', ui.layoutCount() > layouts); layouts = ui.layoutCount(); update(4); }
  if (frame === 11) { console.log('children', ui.layoutCount() > layouts); quit(); }
});
