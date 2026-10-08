// A React Native screen as React Native developers write it (ZN-290): only the two imports below differ from the React Native original
// ('react' -> 'zinc:ui/react', 'react-native' -> 'zinc:react-native'). Contacts with a search field, a FlatList of rows (avatar with initials and an absolute
// online badge, a bio that wraps to two lines, a percent progress bar), a header and a bottom action.
import { useState } from 'zinc:ui/react';
import { View, Text, TextInput, FlatList, Pressable, StyleSheet, ListRenderItemInfo } from 'zinc:react-native';

type Contact = { id: string; name: string; bio: string; online: boolean; progress: number };

const CONTACTS: Contact[] = [
  { id: '1', name: 'Ada Lovelace', bio: 'Wrote the first algorithm meant for a machine, and saw that it could do more than numbers.', online: true, progress: 0.8 },
  { id: '2', name: 'Grace Hopper', bio: 'Built the first compiler. Taught a navy to speak COBOL.', online: false, progress: 0.45 },
  { id: '3', name: 'Katherine Johnson', bio: 'Computed the trajectories that took astronauts to the Moon and back.', online: true, progress: 0.62 },
  { id: '4', name: 'Margaret Hamilton', bio: 'Led the Apollo flight software team.', online: false, progress: 0.3 },
  { id: '5', name: 'Radia Perlman', bio: 'Invented the spanning tree protocol that keeps Ethernet networks from looping.', online: true, progress: 0.95 },
];

function initials(name: string): string {
  const parts = name.split(' ');
  return parts.length > 1 ? parts[0].charAt(0) + parts[parts.length - 1].charAt(0) : name.charAt(0);
}

function Row({ item }: ListRenderItemInfo<Contact>) {
  return (
    <View style={styles.row}>
      <View style={styles.avatar}>
        <Text style={styles.initials}>{initials(item.name)}</Text>
        {item.online && <View style={styles.badge} />}
      </View>
      <View style={styles.body}>
        <Text style={styles.name}>{item.name}</Text>
        <Text style={styles.bio} numberOfLines={2}>{item.bio}</Text>
        <View style={styles.track}>
          <View style={[styles.fill, { width: `${Math.round(item.progress * 100)}%` }]} />
        </View>
      </View>
    </View>
  );
}

export default function App() {
  const [query, setQuery] = useState('');
  const shown = CONTACTS.filter((c: Contact) => c.name.toLowerCase().includes(query.toLowerCase()));
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Contacts</Text>
        <Text style={styles.count}>{shown.length} people</Text>
      </View>
      <TextInput style={styles.search} placeholder="Search" value={query} onChangeText={setQuery} />
      <FlatList
        data={shown}
        keyExtractor={(c: Contact) => c.id}
        renderItem={Row}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
      />
      <Pressable style={styles.button} onPress={() => setQuery('')}>
        <Text style={styles.buttonText}>Clear search</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f2f2f7', paddingTop: 48 },
  header: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingHorizontal: 20, marginBottom: 12 },
  title: { fontSize: 32, fontWeight: 'bold', color: '#000000' },
  count: { fontSize: 15, color: '#8e8e93' },
  search: { marginHorizontal: 16, marginBottom: 12, height: 36, borderRadius: 10, paddingHorizontal: 12, backgroundColor: '#e3e3e8', fontSize: 17 },
  row: { flexDirection: 'row', paddingVertical: 12, paddingHorizontal: 16, backgroundColor: '#ffffff' },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#5856d6', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  initials: { color: '#ffffff', fontSize: 18, fontWeight: '600' },
  badge: { position: 'absolute', right: 0, bottom: 0, width: 14, height: 14, borderRadius: 7, backgroundColor: '#34c759', borderWidth: 2, borderColor: '#ffffff' },
  body: { flex: 1 },
  name: { fontSize: 17, fontWeight: '600', color: '#000000' },
  bio: { fontSize: 15, color: '#3c3c43', marginTop: 2 },
  track: { height: 4, borderRadius: 2, backgroundColor: '#e5e5ea', marginTop: 8, overflow: 'hidden' },
  fill: { height: 4, backgroundColor: '#007aff' },
  separator: { height: StyleSheet.hairlineWidth, backgroundColor: '#c6c6c8', marginLeft: 76 },
  button: { margin: 16, height: 50, borderRadius: 12, backgroundColor: '#007aff', alignItems: 'center', justifyContent: 'center' },
  buttonText: { color: '#ffffff', fontSize: 17, fontWeight: '600' },
});
