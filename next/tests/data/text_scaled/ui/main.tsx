// zinc:ui, a Text in a view with a scale transform (ZN-726): the paragraph is laid out at its own size and drawn twice as large, with
// glyphs of twice the size, which this program has no font of (nothing here names 32 pixels). With the argument `plain` the view has no
// transform: the same line breaks are expected. ../ui-direct sets the text at twice the size in a view twice as wide: the same letters
// are expected. tests/t1/text_scaled.sh compares the three.
import { StyleSheet } from 'zinc:ui';
import { render } from 'zinc:ui/solid';
import { args } from 'zinc:sys';

const s = StyleSheet.create({
  page: { width: 520, height: 400, backgroundColor: '#ffffff', alignItems: 'center', justifyContent: 'center' },
  box: { width: 220, transform: [{ scale: args().includes('plain') ? 1 : 2 }] },
  words: { fontSize: 16, lineHeight: 22, color: '#000000' },
});
function App(): i32 {
  return <view style={s.page}><view style={s.box}>
    <text style={s.words}>A paragraph in a scaled view keeps the line breaks it has at its own size, and its letters are those of the size on screen.</text>
  </view></view>;
}
render(App, 0xffffff, (dt: number) => {});
