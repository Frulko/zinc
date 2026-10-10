// The Styles panel's edits (ZN-369): a component styled with classes and one styled with a StyleSheet object, inspected and edited by
// tests/t1/devtools_styles.sh through scripts/cdp-check.mjs --styles. Each box holds a white square that its padding moves.
import 'zinc:devtools';
import { StyleSheet } from 'zinc:ui';
import { render } from 'zinc:ui/solid';

const s = StyleSheet.create({ card: { padding: 8, backgroundColor: '#2563eb', borderRadius: 6 } });

function Tagged(): i32 { return <view class="p-2 bg-rose-600 rounded"><view class="w-4 h-4 bg-white" /></view>; }
function Sheet(): i32 { return <view style={s.card}><view class="w-4 h-4 bg-white" /></view>; }
function App(): i32 {
  return <view class="flex-row items-start gap-4 p-4"><Tagged /><Sheet /></view>;
}
render(App, 0xffffff, (dt: number) => {});
