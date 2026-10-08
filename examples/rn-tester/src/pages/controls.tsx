// Pressable and the Touchables, Switch and ActivityIndicator, TextInput and KeyboardAvoidingView.
import { useState } from 'zinc:ui/react';
import { View, Text, Pressable, TouchableOpacity, TouchableHighlight, TouchableWithoutFeedback, Switch, ActivityIndicator, TextInput, KeyboardAvoidingView,
  Keyboard, StyleSheet } from 'zinc:react-native';
import { Page, Card, Caption, usePalette } from '../kit';

export function PressablePage() {
  const c = usePalette();
  const [presses, setPresses] = useState(0);
  const [longs, setLongs] = useState(0);
  const [last, setLast] = useState('none');
  return <Page>
    <Card title="Pressable">
      <Pressable style={[s.button, { backgroundColor: c.accent }]} onPress={() => { setPresses(presses + 1); setLast('press'); }}
        onLongPress={() => { setLongs(longs + 1); setLast('long press'); }}>
        <Text style={s.buttonText}>Press or hold me</Text>
      </Pressable>
      <Caption text={`${presses} presses, ${longs} long presses, last: ${last}`} />
      <Pressable style={[s.button, { backgroundColor: c.line }]} disabled={true} onPress={() => setLast('disabled')}>
        <Text style={s.buttonText}>Disabled</Text>
      </Pressable>
    </Card>
    <Card title="TouchableOpacity · TouchableHighlight">
      <TouchableOpacity style={[s.button, { backgroundColor: 0x34c759 }]} activeOpacity={0.4} onPress={() => setLast('opacity')}>
        <Text style={s.buttonText}>activeOpacity 0.4</Text>
      </TouchableOpacity>
      <TouchableHighlight style={[s.button, { backgroundColor: 0xff9500 }]} underlayColor="#c93400" onPress={() => setLast('highlight')}>
        <Text style={s.buttonText}>underlayColor</Text>
      </TouchableHighlight>
      <TouchableWithoutFeedback onPress={() => setLast('without feedback')}><Text style={{ color: c.accent, fontSize: 17 }}>TouchableWithoutFeedback</Text></TouchableWithoutFeedback>
    </Card>
  </Page>;
}

export function SwitchPage() {
  const c = usePalette();
  const [wifi, setWifi] = useState(true);
  const [air, setAir] = useState(false);
  const [busy, setBusy] = useState(true);
  return <Page>
    <Card title="Switch">
      <View style={s.row}><Text style={[s.label, { color: c.ink }]}>Wi-Fi</Text><Switch value={wifi} onValueChange={setWifi} /></View>
      <View style={s.row}><Text style={[s.label, { color: c.ink }]}>Airplane mode</Text><Switch value={air} onValueChange={setAir} trackColor={{ false: '#767577', true: '#ff9500' }} thumbColor="#ffffff" /></View>
      <View style={s.row}><Text style={[s.label, { color: c.muted }]}>Disabled</Text><Switch value={true} disabled={true} /></View>
    </Card>
    <Card title="ActivityIndicator">
      <View style={[s.row, { justifyContent: 'space-around' }]}>
        <ActivityIndicator animating={busy} />
        <ActivityIndicator size="large" color="#007aff" animating={busy} />
        <ActivityIndicator size="large" color="#ff2d55" animating={busy} hidesWhenStopped={false} />
      </View>
      <View style={s.row}><Text style={[s.label, { color: c.ink }]}>animating</Text><Switch value={busy} onValueChange={setBusy} /></View>
    </Card>
  </Page>;
}

export function TextInputPage() {
  const c = usePalette();
  const [name, setName] = useState('');
  const [sent, setSent] = useState('');
  return <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
    <Page>
      <Card title="TextInput">
        <TextInput style={[s.field, { backgroundColor: c.bg, color: c.ink }]} placeholder="Your name" value={name} onChangeText={setName}
          maxLength={20} onSubmitEditing={() => setSent(name)} />
        <Caption text={`${name.length}/20 · submitted: ${sent === '' ? '-' : sent}`} />
        <TextInput style={[s.field, { backgroundColor: c.bg, color: c.ink }]} placeholder="PIN" secureTextEntry={true} keyboardType="number-pad" />
        <TextInput style={[s.field, { backgroundColor: c.bg, color: c.ink, height: 88 }]} multiline={true} defaultValue={'Several lines\nof notes'} />
        <TextInput style={[s.field, { backgroundColor: c.bg, color: c.muted }]} editable={false} defaultValue="Read only" />
      </Card>
      <Card title="Keyboard">
        <Pressable style={[s.button, { backgroundColor: c.accent }]} onPress={() => Keyboard.dismiss()}><Text style={s.buttonText}>Keyboard.dismiss()</Text></Pressable>
        <Caption text="KeyboardAvoidingView pads this page by the on-screen keyboard's height." />
      </Card>
    </Page>
  </KeyboardAvoidingView>;
}

const s = StyleSheet.create({
  button: { height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  buttonText: { color: '#ffffff', fontSize: 17, fontWeight: '600' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  label: { fontSize: 17 },
  field: { height: 40, borderRadius: 8, paddingHorizontal: 12, fontSize: 17 },
});
