// Media: a gallery (a virtualised grid of generated pictures; a viewer with pinch, double tap and buttons to zoom, and a share sheet), an audio player
// (play, pause, seek, progress) and a video with its poster when there is no decoder. './media' is the desktop's real players or the stand-ins.
import { useState, useRef } from 'zinc:ui/react';
import { View, Text, Pressable, Modal, FlatList, ListRenderItemInfo, StyleSheet, Dimensions } from 'zinc:react-native';
import * as ui from 'zinc:ui';
import { setClipboardText, drawImage } from 'zinc:gfx';
import { Icon } from 'zinc:icons';
import { theme, SP, R_CARD } from '../theme';
import { tr } from '../i18n';
import { Section, ActionButton, Badge, Progress, s as k, toast } from '../parts';
import { Segmented } from '../controls';
import { picture, TITLES } from '../art';
import { Track, Clip, openClip } from '../media';
import { onLeave, leaveScreen } from '../nav';
import { notes, saveNotes, nextId, Note } from '../store';

const PICS: number[] = [];
for (let i = 0; i < 60; i++) PICS.push(i);

export function MediaScreen() {
  const [page, setPage] = useState(0);
  return <View style={{ flex: 1 }}>
    <View style={{ paddingHorizontal: SP * 4, paddingVertical: SP * 3 }}>
      <Segmented options={[tr('Gallery'), tr('Audio'), tr('Video')]} value={page} onChange={(i: number) => { leaveScreen(); setPage(i); }} />
    </View>
    {page === 0 ? <Gallery /> : page === 1 ? <AudioPlayer /> : <VideoPlayer />}
  </View>;
}

function Gallery() {
  const c = theme();
  const [open, setOpen] = useState(-1);
  const [zoom, setZoom] = useState(1);
  const [share, setShare] = useState(false);
  const tile = Math.floor((Math.min(Dimensions.get('window').width, 960) - SP * 6 - SP * 6) / 3);
  const show = (i: number): void => { setZoom(1); setOpen(i); };
  const z = (v: number): void => setZoom(Math.max(1, Math.min(4, v)));
  return <View style={{ flex: 1 }}>
    <FlatList data={PICS} numColumns={3} keyExtractor={(i: number) => `${i}`} columnWrapperStyle={{ paddingHorizontal: SP * 3 }}
      getItemLayout={(d: number[], i: number) => { return { length: tile + SP * 2, offset: (tile + SP * 2) * i, index: i }; }}
      renderItem={(x: ListRenderItemInfo<number>) => <Pressable style={{ height: tile, margin: SP, borderRadius: 12, overflow: 'hidden' }} onPress={() => show(x.item)} accessibilityLabel={`${TITLES[x.item % TITLES.length]} ${x.item + 1}`}>
        <Canvas style={{ flex: 1, lazy: 1 }} onDraw={(cx: i32, cy: i32, w: i32, h: i32) => picture(cx, cy, w, h, x.item, 12)} />
      </Pressable>} />
    <Modal visible={open >= 0} animationType="fade" transparent={true} onRequestClose={() => setOpen(-1)}>
      <View style={st.viewer}>
        <View style={st.bar}>
          <Pressable style={st.round} onPress={() => setOpen(-1)} accessibilityLabel={tr('Close')}><Icon name="x" size={22} color={() => 0xFFFFFF} /></Pressable>
          <Text style={[k.body, { color: 0xFFFFFF, fontWeight: '600', flex: 1, textAlign: 'center' }]}>{open >= 0 ? `${TITLES[open % TITLES.length]} · ${open + 1}` : ''}</Text>
          <Pressable style={st.round} onPress={() => setShare(true)} accessibilityLabel={tr('Share')}><Icon name="share-2" size={20} color={() => 0xFFFFFF} /></Pressable>
        </View>
        <View style={st.stage} onPinch={(e: ui.PointerEvent) => z(zoom * e.scale)} onDoubleClick={() => z(zoom > 1 ? 1 : 2)}>
          <View style={{ width: 340, height: 340, transform: [{ scale: zoom }] }}>
            <Canvas style={{ flex: 1, lazy: 1 }} onDraw={(cx: i32, cy: i32, w: i32, h: i32) => picture(cx, cy, w, h, Math.max(0, open), 18)} />
          </View>
        </View>
        <View style={st.zoomRow}>
          <Pressable style={st.round} onPress={() => z(zoom / 1.5)} accessibilityLabel="zoom out"><Icon name="minus" size={20} color={() => 0xFFFFFF} /></Pressable>
          <Text style={[k.small, { color: 0xFFFFFF, width: 70, textAlign: 'center' }]}>{`${Math.round(zoom * 100)}%`}</Text>
          <Pressable style={st.round} onPress={() => z(zoom * 1.5)} accessibilityLabel="zoom in"><Icon name="plus" size={20} color={() => 0xFFFFFF} /></Pressable>
        </View>
        <Text style={[k.tiny, { color: 0xFFFFFF, opacity: 0.7, textAlign: 'center' }]}>Pinch or double tap to zoom</Text>
      </View>
      {share && <Pressable style={st.shade} onPress={() => setShare(false)}>
        <View style={[st.sheet, { backgroundColor: c.surface }]}>
          <Text style={[k.heading, { color: c.ink }]}>{tr('Share')}</Text>
          <View style={[k.rowFlat, { gap: SP * 4, justifyContent: 'space-around' }]}>
            <ShareTarget icon="copy" label="Copy link" onPress={() => { setClipboardText(`https://zinc.example/gallery/${open + 1}`); setShare(false); toast(tr('Copy') + ' ✓'); }} />
            <ShareTarget icon="clipboard-list" label="To notes" onPress={() => { saveNotes([new Note(nextId(), `Look again at ${TITLES[open % TITLES.length]} ${open + 1}`, false)].concat(notes)); setShare(false); toast(tr('Saved')); }} />
            <ShareTarget icon="mail" label="Mail" onPress={() => { setShare(false); toast('A share sheet stand-in: no mail app here'); }} />
          </View>
          <ActionButton title={tr('Cancel')} kind="secondary" onPress={() => setShare(false)} />
        </View>
      </Pressable>}
    </Modal>
  </View>;
}
function ShareTarget(p: { icon: string; label: string; onPress: () => void }) {
  const c = theme();
  return <Pressable style={{ alignItems: 'center', gap: SP * 2, width: 80 }} onPress={p.onPress} accessibilityLabel={p.label}>
    <View style={[st.target, { backgroundColor: c.raised }]}><Icon name={p.icon} size={22} color={() => theme().ink} /></View>
    <Text style={[k.tiny, { color: c.ink }]}>{p.label}</Text>
  </Pressable>;
}

function clock(s: number): string { const m = Math.floor(s / 60), r = Math.floor(s % 60); return `${m}:${r < 10 ? '0' : ''}${r}`; }

function AudioPlayer() {
  const c = theme();
  const track = useRef<Track | null>(null);
  if (track.current === null) { const t = new Track(); track.current = t; onLeave((): void => t.pause()); }
  const t = track.current as Track;
  const [pos, setPos] = useState(0);
  const [playing, setPlaying] = useState(false);
  const timer = useRef<i32>(-1);
  const stopTimer = (): void => { if (timer.current >= 0) clearInterval(timer.current); timer.current = -1; };
  const toggle = (): void => {
    if (t.playing) { t.pause(); stopTimer(); setPlaying(false); setPos(t.position); return; }
    t.play(); setPlaying(true);
    timer.current = setInterval((): void => setPos(t.position), 250);   // progress 4 times a second, only while playing
    onLeave(stopTimer);
  };
  const seek = (d: number): void => { t.seek(t.position + d); setPos(t.position); };
  const note = t.available();
  return <View style={{ paddingHorizontal: SP * 4, gap: SP * 4 }}>
    <View style={[st.cover, { backgroundColor: c.surface, borderColor: c.line }]}>
      <Canvas style={{ width: 200, height: 200, lazy: 1 }} onDraw={(cx: i32, cy: i32, w: i32, h: i32) => picture(cx, cy, w, h, 4, 24)} />
      <Text style={[k.heading, { color: c.ink }]}>{t.title}</Text>
      <Text style={[k.small, { color: c.muted }]}>Synthesised in the app with zinc:audio</Text>
      {note !== '' && <Badge text={note} tone="info" />}
    </View>
    <View style={{ gap: SP }}>
      <Progress value={pos / t.duration} />
      <View style={[k.rowFlat, { justifyContent: 'space-between' }]}><Text style={[k.tiny, { color: c.muted }]}>{clock(pos)}</Text><Text style={[k.tiny, { color: c.muted }]}>{clock(t.duration)}</Text></View>
    </View>
    <View style={[k.rowFlat, { justifyContent: 'center', gap: SP * 6 }]}>
      <Pressable style={[st.ctl, { backgroundColor: c.raised }]} onPress={() => seek(-2)} accessibilityLabel="back 2 seconds"><Icon name="skip-back" size={22} color={() => theme().ink} /></Pressable>
      <Pressable style={[st.play, { backgroundColor: c.accent }]} onPress={toggle} accessibilityLabel={playing ? tr('Pause') : tr('Play')}>
        <Icon name={playing ? 'pause' : 'play'} size={30} color={() => theme().accentInk} />
      </Pressable>
      <Pressable style={[st.ctl, { backgroundColor: c.raised }]} onPress={() => seek(2)} accessibilityLabel="forward 2 seconds"><Icon name="skip-forward" size={22} color={() => theme().ink} /></Pressable>
    </View>
  </View>;
}

function VideoPlayer() {
  const c = theme();
  const clip = useRef<Clip | null>(null);
  if (clip.current === null) { const v = openClip(); clip.current = v; onLeave((): void => v.close()); }
  const v = clip.current as Clip;
  const [playing, setPlaying] = useState(false);
  const note = v.available();
  return <View style={{ paddingHorizontal: SP * 4, gap: SP * 4 }}>
    <Section title="Video">
      <Canvas style={{ height: 210, lazy: playing ? 0 : 1 }} onDraw={(cx: i32, cy: i32, w: i32, h: i32) => {
        const img = v.image;
        if (img >= 0) { drawImage(img as i32, cx, cy, w, h, 255, 0); return; }
        picture(cx, cy, w, h, 1, 0);
      }} />
      <View style={k.pad}>
        <View style={[k.rowFlat, { justifyContent: 'space-between' }]}>
          <Text style={[k.heading, { color: c.ink }]}>SMPTE bars</Text>
          <Badge text={v.image >= 0 ? 'zinc:video' : 'poster'} tone={v.image >= 0 ? 'ok' : 'neutral'} />
        </View>
        {note !== '' && <Text style={[k.small, { color: c.muted }]}>{note}</Text>}
        <ActionButton title={playing ? tr('Pause') : tr('Play')} icon={playing ? 'pause' : 'play'} disabled={v.image < 0}
          onPress={() => { if (playing) v.pause(true); else { v.play(); v.pause(false); } setPlaying(!playing); }} />
      </View>
    </Section>
  </View>;
}

const st = StyleSheet.create({
  viewer: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.92)', paddingTop: SP * 4, gap: SP * 4 },
  bar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SP * 4 },
  round: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255, 255, 255, 0.14)' },
  stage: { flex: 1, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  zoomRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SP * 4 },
  shade: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(0, 0, 0, 0.35)', justifyContent: 'flex-end' },
  sheet: { padding: SP * 6, paddingBottom: SP * 10, gap: SP * 5, borderTopLeftRadius: R_CARD, borderTopRightRadius: R_CARD },
  target: { width: 56, height: 56, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  cover: { alignItems: 'center', gap: SP * 2, padding: SP * 5, borderRadius: R_CARD, borderWidth: 1 },
  ctl: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  play: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center' },
});
