import { useState } from 'react';
import { AppRegistry, View, Text, Pressable, Button, TextInput, StyleSheet } from 'react-native';

function App(): i32 {
  const [count, setCount] = useState<i32>(0);
  const [name, setName] = useState<string>('');
  return <View style={styles.page}>
    <Text style={styles.title}>Primitives</Text>
    <Pressable onPress={() => { setCount(count + 1); console.log(`pressed ${count + 1}`); }} style={styles.box}><Text>Pressed {count}</Text></Pressable>
    <Button title="A button" onPress={() => console.log('button')} />
    <TextInput value={name} onChangeText={setName} placeholder="Name" style={styles.field} />
  </View>;
}
const styles = StyleSheet.create({
  page: { flex: 1, padding: 16, gap: 12, backgroundColor: '#ffffff' },
  title: { fontSize: 20, fontWeight: 'bold' },
  box: { padding: 8, borderRadius: 8, backgroundColor: '#e2e8f0' },
  field: { borderWidth: 1, borderColor: '#94a3b8', padding: 6 },
});
AppRegistry.registerComponent('main', () => App);
