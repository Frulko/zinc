// An idle React Native screen stays idle (tests/t1/rn_idle.sh): useWindowDimensions and KeyboardAvoidingView poll through zinc:ui watchers, icons are
// lazy canvases and a stopped ActivityIndicator is one too, so after the first frames every frame is kept (no paint) and allocates nothing.
import { useState } from 'zinc:ui/react';
import { render } from 'zinc:ui/react';
import { View, Text, ActivityIndicator, KeyboardAvoidingView, useWindowDimensions } from 'zinc:react-native';
import { Icon } from 'zinc:icons';
import { allocations } from 'zinc:sys';
import { quit } from 'zinc:gfx';

function App() {
  const win = useWindowDimensions();
  const [n] = useState(1);
  return <KeyboardAvoidingView behavior="padding" style={{ flex: 1, padding: 16, gap: 12 }}>
    <Text>{`window ${win.width} x ${win.height}, ${n} screen`}</Text>
    <View style={{ flexDirection: 'row', gap: 8 }}><Icon name="house" size={20} color={() => 0x1c1917} /><Icon name="wifi" size={20} /></View>
    <ActivityIndicator animating={false} hidesWhenStopped={false} />
  </KeyboardAvoidingView>;
}
let frames = 0, from = 0;
render(App, 0xffffff, (dt: number): void => {
  frames++;
  if (frames === 30) from = allocations();
  if (frames === 230) { console.log(`200 idle frames: ${allocations() - from} allocations`); quit(); }
});
