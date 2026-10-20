import { render } from 'zinc:ui/solid';
function Card(p: { className?: string }): i32 { return <View className={p.className ?? ''} />; }
function App(): i32 {
  return <View>
    <Card class="w-80" />
  </View>;
}
render(App, 0xffffff, null);
