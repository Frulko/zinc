// Modal (slide and fade, onRequestClose on Escape) and Alert.alert (buttons with cancel and destructive styles).
import { useState, useEffect } from 'zinc:ui/react';
import { View, Text, Pressable, Modal, Alert, StyleSheet } from 'zinc:react-native';
import { env } from 'zinc:sys';
import { Page, Card, Caption, usePalette } from '../kit';

let shown = false;
export function DialogsPage() {
  const c = usePalette();
  const [slide, setSlide] = useState(false);
  const [fade, setFade] = useState(false);
  const [answer, setAnswer] = useState('-');
  useEffect((): void => {   // RN_TESTER_ALERT=1: the dialog open for the screenshot (after the first render: the app is mounted)
    if (!shown && env('RN_TESTER_ALERT') === '1') { shown = true; Alert.alert('Delete draft?', 'This cannot be undone.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive' }]); }
  }, []);
  return <Page>
    <Card title="Modal">
      <Pressable style={[s.button, { backgroundColor: c.accent }]} onPress={() => setSlide(true)}><Text style={s.buttonText}>animationType slide</Text></Pressable>
      <Pressable style={[s.button, { backgroundColor: c.accent }]} onPress={() => setFade(true)}><Text style={s.buttonText}>transparent, fade</Text></Pressable>
      <Caption text="Escape asks onRequestClose." />
    </Card>
    <Card title="Alert.alert">
      <Pressable style={[s.button, { backgroundColor: 0xff3b30 }]} onPress={() => Alert.alert('Delete draft?', 'This cannot be undone.', [
        { text: 'Cancel', style: 'cancel', onPress: () => setAnswer('cancel') }, { text: 'Delete', style: 'destructive', onPress: () => setAnswer('delete') }])}>
        <Text style={s.buttonText}>Two buttons</Text>
      </Pressable>
      <Pressable style={[s.button, { backgroundColor: c.accent }]} onPress={() => Alert.alert('Saved', 'Your changes are stored.')}><Text style={s.buttonText}>One button</Text></Pressable>
      <Caption text={`last answer: ${answer}`} />
    </Card>
    <Modal visible={slide} animationType="slide" onRequestClose={() => setSlide(false)}>
      <View style={[s.sheet, { backgroundColor: c.bg }]}>
        <Text style={[s.title, { color: c.ink }]}>A slide-up modal</Text>
        <Pressable style={[s.button, { backgroundColor: c.accent }]} onPress={() => setSlide(false)}><Text style={s.buttonText}>Close</Text></Pressable>
      </View>
    </Modal>
    <Modal visible={fade} transparent={true} animationType="fade" onRequestClose={() => setFade(false)}>
      <View style={s.dim}>
        <View style={[s.card, { backgroundColor: c.card }]}>
          <Text style={[s.title, { color: c.ink }]}>A transparent modal</Text>
          <Pressable style={[s.button, { backgroundColor: c.accent }]} onPress={() => setFade(false)}><Text style={s.buttonText}>Close</Text></Pressable>
        </View>
      </View>
    </Modal>
  </Page>;
}
const s = StyleSheet.create({
  button: { height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  buttonText: { color: '#ffffff', fontSize: 17, fontWeight: '600' },
  sheet: { flex: 1, paddingTop: 80, padding: 24, gap: 24 },
  title: { fontSize: 22, fontWeight: '600' },
  dim: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.4)', alignItems: 'center', justifyContent: 'center' },
  card: { width: 300, borderRadius: 16, padding: 24, gap: 16 },
});
