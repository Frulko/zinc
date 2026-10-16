// Components: the everyday building blocks of an app, each in a working state. Buttons, switches and a slider, a segmented picker and chips,
// badges and avatars, a card, progress and activity indicators, skeletons, a modal sheet, an alert and a toast.
import { useState } from 'zinc:ui/react';
import { View, Text, Switch, ActivityIndicator, Modal, Alert, Pressable, StyleSheet, useWindowDimensions } from 'zinc:react-native';
import { Icon } from 'zinc:icons';
import { theme, SP, R_CARD } from '../theme';
import { tr } from '../i18n';
import { Screen, Section, ActionButton, Chip, Badge, Avatar, Progress, SkeletonRows, Row, Divider, Line, toast, s as k } from '../parts';
import { Segmented, Slider } from '../controls';

const PEOPLE: string[] = ['Ada Lovelace', 'Grace Hopper', 'Alan Turing', 'Katherine Johnson', 'Linus Torvalds'];
const TINTS: number[] = [0xE8492A, 0x2563EB, 0x15803D, 0x6D28D9, 0xB45309];
const SIZES: string[] = ['S', 'M', 'L', 'XL'];
const TAGS: string[] = ['Design', 'Music', 'Travel', 'Code', 'Food', 'Games'];

export function ComponentsScreen() {
  const c = theme();
  const win = useWindowDimensions();
  const [notify, setNotify] = useState(true);
  const [wifi, setWifi] = useState(false);
  const [volume, setVolume] = useState(0.6);
  const [size, setSize] = useState(1);
  const [tags, setTags] = useState<string[]>(['Music', 'Code']);
  const [loading, setLoading] = useState(false);   // spinners and skeletons on demand: the idle screen draws nothing per frame
  const [sheet, setSheet] = useState(false);
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState('-');
  const sliderW = Math.min(win.width, 640) - SP * 16;
  const toggle = (t: string): void => setTags(tags.indexOf(t) >= 0 ? tags.filter((x: string) => x !== t) : tags.concat([t]));
  return <Screen>
    <Section title="Buttons">
      <View style={k.pad}>
        <ActionButton title={tr('Primary')} icon="sparkles" onPress={() => toast(tr('Primary'))} />
        <View style={[k.rowFlat, { gap: SP * 2 }]}>
          <View style={{ flex: 1 }}><ActionButton title={tr('Secondary')} kind="secondary" onPress={() => toast(tr('Secondary'))} /></View>
          <View style={{ flex: 1 }}><ActionButton title="Ghost" kind="ghost" onPress={() => toast('Ghost')} /></View>
        </View>
        <View style={[k.rowFlat, { gap: SP * 2 }]}>
          <View style={{ flex: 1 }}><ActionButton title={tr('Danger')} kind="danger" icon="trash" onPress={() => Alert.alert(tr('Delete this item?'), '', [
            { text: tr('Cancel'), style: 'cancel', onPress: () => setAnswer('cancel') }, { text: tr('Delete'), style: 'destructive', onPress: () => setAnswer('delete') }])} /></View>
          <View style={{ flex: 1 }}><ActionButton title={tr('Disabled')} disabled={true} /></View>
        </View>
        <ActionButton title={busy ? tr('Sending…') : 'Busy for 1.5 s'} kind="secondary" busy={busy} onPress={() => { setBusy(true); setTimeout((): void => setBusy(false), 1500); }} />
        <Text style={[k.small, { color: c.muted }]}>{`Alert answer: ${answer}`}</Text>
      </View>
    </Section>

    <Section title="Switches and sliders">
      <View style={k.row}><Icon name="bell" size={20} color={() => theme().ink} /><Text style={[k.body, { color: c.ink, flex: 1 }]}>{tr('Notifications')}</Text><Switch value={notify} onValueChange={setNotify} trackColor={{ true: '#e8492a' }} /></View>
      <Divider />
      <View style={k.row}><Icon name="wifi" size={20} color={() => theme().ink} /><Text style={[k.body, { color: c.ink, flex: 1 }]}>Wi-Fi</Text><Switch value={wifi} onValueChange={setWifi} /></View>
      <Divider />
      <View style={[k.pad, { gap: SP * 2 }]}>
        <View style={[k.rowFlat, { justifyContent: 'space-between' }]}><Text style={[k.body, { color: c.ink }]}>{tr('Volume')}</Text><Text style={[k.small, { color: c.muted }]}>{`${Math.round(volume * 100)}%`}</Text></View>
        <Slider value={volume} width={sliderW} onChange={setVolume} label={tr('Volume')} />
      </View>
    </Section>

    <Section title="Picker">
      <View style={k.pad}>
        <Segmented options={SIZES} value={size} onChange={setSize} />
        <View style={k.wrap}>{TAGS.map((t: string) => <Chip title={t} on={tags.indexOf(t) >= 0} onPress={() => toggle(t)} />)}</View>
        <Text style={[k.small, { color: c.muted }]}>{`Size ${SIZES[size]} · ${tags.length} tags: ${tags.join(', ')}`}</Text>
      </View>
    </Section>

    <Section title="Badges and avatars">
      <View style={k.pad}>
        <View style={k.wrap}><Badge text="Live" tone="ok" dot={true} /><Badge text="Beta" tone="info" /><Badge text="3 new" tone="warn" /><Badge text="Failed" tone="danger" /><Badge text="Draft" tone="neutral" /></View>
        <View style={k.rowFlat}>
          {PEOPLE.map((n: string, i: number) => <View style={[st.stack, { borderColor: c.surface, marginLeft: i === 0 ? 0 : -10 }]}><Avatar name={n} tint={TINTS[i]} size={40} /></View>)}
          <Text style={[k.small, { color: c.muted, marginLeft: SP * 3 }]}>{`${PEOPLE.length} people`}</Text>
        </View>
      </View>
    </Section>

    <Section title="Cards">
      <View style={[st.cover, { backgroundColor: c.accentSoft }]}>
        <Icon name="music" size={40} color={() => theme().accent} />
      </View>
      <View style={k.pad}>
        <View style={[k.rowFlat, { justifyContent: 'space-between' }]}><Text style={[k.heading, { color: c.ink }]}>Evening sessions</Text><Badge text="New" tone="info" /></View>
        <Text style={[k.small, { color: c.muted }]}>A card is a View with a radius, a border and overflow hidden: the cover keeps the corners.</Text>
        <View style={[k.rowFlat, { gap: SP * 2 }]}><Avatar name={PEOPLE[1]} tint={TINTS[1]} size={28} /><Text style={[k.small, { color: c.ink }]}>{PEOPLE[1]}</Text></View>
      </View>
    </Section>

    <Section title="Progress">
      <View style={k.pad}>
        <Line k="Upload" v="72%" /><Progress value={0.72} />
        <Line k="Storage" v="35%" /><Progress value={0.35} tint={c.ok} />
        <View style={[k.rowFlat, { justifyContent: 'space-around', paddingTop: SP * 2 }]}>
          <ActivityIndicator animating={loading} />
          <ActivityIndicator size="large" color="#e8492a" animating={loading} />
          <ActivityIndicator size="large" color="#2563eb" animating={loading} hidesWhenStopped={false} />
        </View>
      </View>
    </Section>

    <Section title="Skeletons">
      {loading ? <SkeletonRows rows={3} /> : <View>
        {PEOPLE.slice(0, 3).map((n: string, i: number) => <Row icon="user" tint={TINTS[i]} title={n} sub="Loaded" />)}
      </View>}
      <View style={k.pad}><ActionButton title={loading ? 'Finish loading' : 'Show skeletons'} kind="secondary" onPress={() => setLoading(!loading)} /></View>
    </Section>

    <Section title="Dialogs">
      <View style={k.pad}>
        <ActionButton title={tr('Open modal')} kind="secondary" icon="layout-grid" onPress={() => setSheet(true)} />
        <ActionButton title={tr('Show alert')} kind="secondary" icon="circle-alert" onPress={() => Alert.alert(tr('Saved'), 'Alert.alert shows an in-app dialog.')} />
        <ActionButton title={tr('Show toast')} kind="secondary" icon="circle-check" onPress={() => toast(tr('Saved'))} />
      </View>
    </Section>

    <Modal visible={sheet} transparent={true} animationType="slide" onRequestClose={() => setSheet(false)}>
      <Pressable style={st.shade} onPress={() => setSheet(false)}>
        <View style={[st.sheet, { backgroundColor: c.surface }]}>
          <View style={[st.grip, { backgroundColor: c.line }]} />
          <Text style={[k.title, { color: c.ink }]}>A bottom sheet</Text>
          <Text style={[k.body, { color: c.muted }]}>A Modal with transparent and animationType="slide". Escape or a tap on the shade closes it.</Text>
          <ActionButton title={tr('Close')} onPress={() => setSheet(false)} />
        </View>
      </Pressable>
    </Modal>
  </Screen>;
}

const st = StyleSheet.create({
  stack: { borderWidth: 2, borderRadius: 22 },
  cover: { height: 120, alignItems: 'center', justifyContent: 'center' },
  shade: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.35)', justifyContent: 'flex-end' },
  sheet: { padding: SP * 6, paddingBottom: SP * 10, gap: SP * 4, borderTopLeftRadius: R_CARD, borderTopRightRadius: R_CARD },
  grip: { width: 40, height: 5, borderRadius: 3, alignSelf: 'center' },
});
