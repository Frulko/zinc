import { createSignal, render } from 'zinc:ui/solid';

const [count, setCount] = createSignal<i32>(0);

function App(): i32 {
  return <View style={{ flex: 1, padding: 16, gap: 12, backgroundColor: '#f8fafc' }}>
    <Text style={{ fontSize: 20, fontWeight: 'bold', color: '#0f172a' }}>Style objects only</Text>
    <View onClick={() => { setCount(count() + 1); console.log(`pressed ${count()}`); }}
      style={{ paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8, backgroundColor: '#2563eb', alignItems: 'center' }}>
      <Text style={{ color: '#ffffff', fontSize: 16 }}>Pressed {count()} times</Text>
    </View>
    <View style={{ height: 40, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 6, opacity: count() > 2 ? 0.5 : 1 }} />
  </View>;
}
render(App, 0xf8fafc, null);
