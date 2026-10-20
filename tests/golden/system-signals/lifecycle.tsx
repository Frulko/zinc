// The phone's lifecycle and rotation (ZN-625), driven by lifecycle.input: home and return (background, foreground: AppState changes, nothing is
// drawn between them: the frame counter stops), a rotation (the surface turns: Dimensions changes, the orientation signal) and the safe area of the new side.
import { View, Text, AppState, Dimensions, DimensionsChange, SafeAreaView } from 'zinc:react-native';
import { render, useState } from 'zinc:ui/react';
import * as ui from 'zinc:ui';

AppState.addEventListener('change', (s: string): void => console.log(`AppState ${s} (now ${AppState.currentState})`));
Dimensions.addEventListener('change', (e: DimensionsChange): void => console.log(`Dimensions ${e.window.width}x${e.window.height}`));
ui.addSignalListener((kind: string, arg: string): void => { if (kind === 'orientation' || kind === 'safearea') console.log(`${kind} ${arg} -> safe ${ui.safeArea().join(',')}`); });

let tick: (n: number) => void = (n: number): void => {};
let frames = 0;
function App(): i32 {
  const [n, setN] = useState(0);
  tick = setN;
  return <SafeAreaView style={{ flex: 1, backgroundColor: '#e2e8f0' }}>
    <View style={{ flex: 1, backgroundColor: '#ffffff', margin: 4 }}><Text style={{ color: "#0f172a", fontSize: 16 }}>{`frame ${n}`}</Text></View>
    <View style={{ height: 12, backgroundColor: '#3b82f6' }} />
  </SafeAreaView>;
}
render(App, 0xffffff, (dt: number) => { frames++; tick(frames); });
