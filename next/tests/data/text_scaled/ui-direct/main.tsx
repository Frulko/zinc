// The paragraph of ../ui set directly at twice the size, in a view twice as wide: what its scaled view must look like.
import { StyleSheet } from 'zinc:ui';
import { render } from 'zinc:ui/solid';

const s = StyleSheet.create({
  page: { width: 520, height: 400, backgroundColor: '#ffffff', alignItems: 'center', justifyContent: 'center' },
  box: { width: 440 },
  words: { fontSize: 32, lineHeight: 44, color: '#000000' },
});
function App(): i32 {
  return <view style={s.page}><view style={s.box}>
    <text style={s.words}>A paragraph in a scaled view keeps the line breaks it has at its own size, and its letters are those of the size on screen.</text>
  </view></view>;
}
render(App, 0xffffff, (dt: number) => {});
