// The Styles panel's edits (ZN-369): a component styled with classes and one styled with a StyleSheet object, inspected and edited by
// tests/t1/devtools_styles.sh through scripts/cdp-check.mjs --styles. Each box holds a white square that its padding moves.
import 'zinc:devtools';
import { StyleSheet } from 'zinc:ui';
import { render } from 'zinc:ui/solid';

const s = StyleSheet.create({ card: { padding: 8, backgroundColor: '#2563eb', borderRadius: 6 } });

function Tagged(): i32 { return <View className="p-2 bg-rose-600 rounded"><View className="w-4 h-4 bg-white" /></View>; }
function Sheet(): i32 { return <View style={s.card}><View className="w-4 h-4 bg-white" /></View>; }
function App(): i32 {
  return <View className="flex-row items-start gap-4 p-4"><Tagged /><Sheet /></View>;
}
render(App, 0xffffff, (dt: number) => {});
