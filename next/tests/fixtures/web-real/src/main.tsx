// The two things a real window does that scripted tests do not: a window resize while a tab that was left still listens to the window size (its update must not
// touch the screen now on show), and typing into a field (each key must arrive once). tools/web-real-test drives it (tests/t1/web_real.sh).
import { render, useState } from 'zinc:ui/react';
import { View, Text, TextInput, Pressable, useWindowDimensions } from 'zinc:react-native';

function Home(): i32 {
  const d = useWindowDimensions();
  return <View style={{ padding: 16 }}><Text style={{ fontSize: 24 }}>{'Home ' + Math.round(d.width)}</Text></View>;
}
function Form(): i32 {
  const [v, setV] = useState('');
  return <View style={{ padding: 16, gap: 8 }}>
    <Text style={{ fontSize: 24 }}>Form screen</Text>
    <TextInput style={{ borderWidth: 1, borderColor: '#94a3b8', borderRadius: 6, padding: 8, backgroundColor: '#ffffff' }} placeholder="type here" value={v} onChangeText={(t: string): void => { setV(t); console.log('typed:' + t); }} />
    <Text>{'value=' + v}</Text>
  </View>;
}
function App(): i32 {
  const [tab, setTab] = useState(0);
  return <View style={{ flex: 1, backgroundColor: '#ffffff' }}>
    <View style={{ flex: 1 }}>{tab === 0 ? <Home /> : <Form />}</View>
    <View style={{ flexDirection: 'row' }}>
      <Pressable style={{ flex: 1, padding: 16, backgroundColor: '#f1f5f9' }} onPress={(): void => setTab(0)}><Text>Home</Text></Pressable>
      <Pressable style={{ flex: 1, padding: 16, backgroundColor: '#e2e8f0' }} onPress={(): void => setTab(1)}><Text>Form</Text></Pressable>
    </View>
  </View>;
}
render(App, 0xffffff, null);
