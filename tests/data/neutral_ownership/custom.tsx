/** @jsxHelpers ./legacy */
import { createSignal } from 'zinc:ui/solid';
function Child(p: { n: i32 }): i32 { return <Text>{p.n}</Text>; }
const [n, setN] = createSignal<i32>(1);
export function Custom(): i32 { return <View><Child n={1} /><Child n={n()} /></View>; }
