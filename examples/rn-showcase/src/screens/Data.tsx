// Data: notes that persist (zinc:storage, store.ts): add, tick, delete with undo, search and filter, in a virtualised FlatList; and what the app
// keeps on the device, key by key. Restart the app: the notes are still there.
import { useState, useRef } from 'zinc:ui/react';
import { View, Text, Pressable, TextInput, FlatList, ListRenderItemInfo, LayoutAnimation, StyleSheet } from 'zinc:react-native';
import * as storage from 'zinc:storage';
import { Icon } from 'zinc:icons';
import { theme, SP, R_CONTROL, T_BODY } from '../theme';
import { tr } from '../i18n';
import { EmptyState, Line, s as k } from '../parts';
import { Segmented } from '../controls';
import { notes, saveNotes, nextId, Note } from '../store';

class Undo { note: Note | null = null; at: number = 0; }

export function DataScreen() {
  const c = theme();
  const [list, setList] = useState<Note[]>(notes);
  const [draft, setDraft] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState(0);   // all, open, done
  const [undo, setUndo] = useState<Undo>(new Undo());
  const [info, setInfo] = useState(false);
  const commit = (next: Note[]): void => { LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); saveNotes(next); setList(next); };
  const add = (): void => { if (draft.trim() === '') return; commit([new Note(nextId(), draft.trim(), false)].concat(list)); setDraft(''); };
  const toggle = (n: Note): void => commit(list.map((m: Note) => m.id === n.id ? new Note(m.id, m.text, !m.done) : m));
  const remove = (n: Note): void => {
    const u = new Undo(); u.note = n; u.at = list.indexOf(n);
    commit(list.filter((m: Note) => m.id !== n.id)); setUndo(u);
  };
  const restore = (): void => {
    const n = undo.note;
    if (n === null) return;
    commit(list.slice(0, undo.at).concat([n as Note]).concat(list.slice(undo.at))); setUndo(new Undo());
  };
  const q = query.trim().toLowerCase();
  const shown = list.filter((n: Note) => (filter === 0 || (filter === 1) !== n.done) && (q === '' || n.text.toLowerCase().indexOf(q) >= 0));
  const open = list.filter((n: Note) => !n.done).length;
  return <View style={{ flex: 1 }}>
    <View style={{ paddingHorizontal: SP * 4, paddingTop: SP * 3, gap: SP * 2 }}>
      <View style={[st.field, { backgroundColor: c.surface, borderColor: c.line }]}>
        <Icon name="plus" size={18} color={() => theme().muted} />
        <TextInput style={[st.input, { color: c.ink, backgroundColor: c.surface }]} value={draft} onChangeText={setDraft} placeholder={tr('New note')} onSubmitEditing={add} maxLength={120} accessibilityLabel={tr('New note')} />
        <Pressable style={[st.add, { backgroundColor: draft.trim() !== '' ? c.accent : c.raised }]} onPress={add} accessibilityLabel={tr('Add')}><Text style={[k.small, { color: draft.trim() !== '' ? c.accentInk : c.muted, fontWeight: '600' }]}>{tr('Add')}</Text></Pressable>
      </View>
      <View style={[st.field, { backgroundColor: c.surface, borderColor: c.line }]}>
        <Icon name="search" size={18} color={() => theme().muted} />
        <TextInput style={[st.input, { color: c.ink, backgroundColor: c.surface }]} value={query} onChangeText={setQuery} placeholder={tr('Search')} keyboardType="web-search" accessibilityLabel={tr('Search')} />
      </View>
      <Segmented options={[`All ${list.length}`, `Open ${open}`, `Done ${list.length - open}`]} value={filter} onChange={setFilter} />
    </View>
    <FlatList data={shown} keyExtractor={(n: Note) => `${n.id}`} style={{ marginTop: SP * 2 }}
      getItemLayout={(d: Note[], i: number) => { return { length: 56, offset: 56 * i, index: i }; }}
      ListEmptyComponent={() => <EmptyState icon={q !== '' ? 'search' : 'clipboard-list'} title={tr('Nothing here yet')} body={q !== '' ? `No note matches “${query}”.` : 'Add a note above: it is saved on this device.'} />}
      renderItem={(x: ListRenderItemInfo<Note>) => <View style={[st.note, { backgroundColor: c.surface, borderColor: c.line }]}>
        <Pressable style={[st.check, { borderColor: x.item.done ? c.ok : c.faint, backgroundColor: x.item.done ? c.ok : c.surface }]} onPress={() => toggle(x.item)} accessibilityLabel={x.item.text}>
          {x.item.done && <Icon name="check" size={14} color={() => 0xFFFFFF} strokeWidth={3} />}
        </Pressable>
        <Text style={[k.body, { color: x.item.done ? c.faint : c.ink, flex: 1 }]} numberOfLines={1}>{x.item.text}</Text>
        <Pressable style={st.del} onPress={() => remove(x.item)} accessibilityLabel={`${tr('Delete')} ${x.item.text}`}><Icon name="trash" size={18} color={() => theme().faint} /></Pressable>
      </View>}
      ListFooterComponent={() => <View style={{ padding: SP * 4, gap: SP * 2 }}>
        <Pressable onPress={() => setInfo(!info)} accessibilityLabel="what is stored"><Text style={[k.small, { color: c.accent }]}>{info ? 'Hide what is stored' : 'What is stored on this device?'}</Text></Pressable>
        {info && <View style={{ gap: 2 }}>{storage.keys().filter((key: string) => key.startsWith('rn-showcase.')).map((key: string) => <Line k={key} v={`${storage.get(key).length} bytes`} />)}</View>}
      </View>} />
    {undo.note !== null && <View style={[st.undo, { backgroundColor: c.ink }]} role="status">
      <Text style={[k.small, { color: c.bg, flex: 1 }]} numberOfLines={1}>{`Deleted “${(undo.note as Note).text}”`}</Text>
      <Pressable onPress={restore} accessibilityLabel={tr('Undo')}><Text style={[k.small, { color: c.accent, fontWeight: '700' }]}>{tr('Undo').toUpperCase()}</Text></Pressable>
    </View>}
  </View>;
}

const st = StyleSheet.create({
  field: { flexDirection: 'row', alignItems: 'center', gap: SP * 2, height: 46, paddingLeft: SP * 3, paddingRight: 4, borderRadius: R_CONTROL, borderWidth: 1 },
  input: { flex: 1, height: 40, fontSize: T_BODY, borderWidth: 0, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 6 },
  add: { height: 36, paddingHorizontal: SP * 4, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  note: { flexDirection: 'row', alignItems: 'center', gap: SP * 3, height: 48, marginHorizontal: SP * 4, marginBottom: SP * 2, paddingHorizontal: SP * 3, borderRadius: 12, borderWidth: 1 },
  check: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  del: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  undo: { position: 'absolute', left: SP * 4, right: SP * 4, bottom: SP * 4, height: 48, borderRadius: 12, flexDirection: 'row', alignItems: 'center', paddingHorizontal: SP * 4, gap: SP * 3 },
});
