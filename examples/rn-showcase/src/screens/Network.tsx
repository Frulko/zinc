// Network: posts from a public JSON API through api.ts (loading skeletons, an error with retry, an empty state, pull to refresh, pages loaded at the
// end of a virtualised FlatList, a detail screen), and a live feed over a WebSocket with connect, disconnect and a composer.
import { useState, useRef, useEffect } from 'zinc:ui/react';
import { View, Text, Pressable, Switch, FlatList, TextInput, ActivityIndicator, ListRenderItemInfo, StyleSheet } from 'zinc:react-native';
import { Icon } from 'zinc:icons';
import { theme, SP, R_CONTROL, T_BODY } from '../theme';
import { tr } from '../i18n';
import { Screen, Section, ActionButton, Badge, Avatar, EmptyState, SkeletonRows, s as k } from '../parts';
import { Segmented } from '../controls';
import { api, Post, PAGE, TOTAL } from '../api';
import { Feed, FeedMessage } from '../feed';
import { goWith, nav, onLeave, leaveScreen, trace } from '../nav';

const TINTS: number[] = [0xE8492A, 0x2563EB, 0x15803D, 0x6D28D9, 0xB45309, 0x0F766E, 0xDC2626, 0x9333EA, 0x0891B2, 0x65A30D];
const cache: Post[] = [];   // the posts loaded so far: the detail screen reads them

export function NetworkScreen() {
  const [page, setPage] = useState(0);
  return <View style={{ flex: 1 }}>
    <View style={{ paddingHorizontal: SP * 4, paddingVertical: SP * 3 }}><Segmented options={[tr('Posts'), tr('Live feed')]} value={page} onChange={(i: number) => { leaveScreen(); setPage(i); }} /></View>
    {page === 0 ? <Posts /> : <LiveFeed />}
  </View>;
}

function Posts() {
  const c = theme();
  const [posts, setPosts] = useState<Post[]>([]);
  const [state, setState] = useState('loading');   // loading, ready, error, empty
  const [more, setMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [mock, setMock] = useState(api.mock);
  const [failing, setFailing] = useState(api.failing);
  const started = useRef<boolean>(false);
  const load = (pg: number, base: Post[]): void => {
    if (pg === 1 && base.length === 0) setState('loading');
    api.posts(pg).then((got: Post[]): void => {
      const all = base.concat(got);
      cache.splice(0, cache.length); for (const p of all) cache.push(p);
      trace(`posts ${all.length}`); setPosts(all); setState(all.length === 0 ? 'empty' : 'ready'); setMore(false); setRefreshing(false);
    }).catch((e: Error): void => { setError(e.message); setState(base.length === 0 ? 'error' : 'ready'); setMore(false); setRefreshing(false); });
  };
  useEffect((): void => { if (started.current) return; started.current = true; load(1, []); }, []);
  const reload = (): void => { setPosts([]); load(1, []); };
  const renderControls = (): i32 => <View style={[st.controls, { backgroundColor: c.surface, borderColor: c.line }]}>
    <View style={k.rowFlat}><Text style={[k.small, { color: c.ink, flex: 1 }]}>{tr('Mock network')}</Text>
      <Switch value={mock} onValueChange={(v: boolean) => { api.mock = v; setMock(v); reload(); }} /></View>
    <View style={k.rowFlat}><Text style={[k.small, { color: c.ink, flex: 1 }]}>Simulate failures</Text>
      <Switch value={failing} onValueChange={(v: boolean) => { api.failing = v; setFailing(v); }} trackColor={{ true: '#dc2626' }} /></View>
    <Text style={[k.tiny, { color: c.muted }]}>{mock ? 'Answers made up in the app (default when deterministic or offline).' : 'jsonplaceholder.typicode.com over HTTPS.'}</Text>
  </View>;
  if (state === 'loading') return <View style={{ flex: 1 }}>{renderControls()}<SkeletonRows rows={6} /></View>;
  if (state === 'error') return <Screen>{renderControls()}<Section title="Posts">
    <EmptyState icon="wifi-off" tone="danger" title={tr('Something went wrong')} body={error} action={tr('Retry')} onAction={reload} />
    {!mock && <View style={k.pad}><ActionButton title="Use mock data" kind="ghost" onPress={() => { api.mock = true; setMock(true); reload(); }} /></View>}
  </Section></Screen>;
  if (state === 'empty') return <Screen>{renderControls()}<EmptyState icon="radio-tower" title={tr('Nothing here yet')} body="The server sent no posts." action={tr('Retry')} onAction={reload} /></Screen>;
  return <FlatList data={posts} keyExtractor={(p: Post) => `${p.id}`}
    ListHeaderComponent={() => <View style={{ paddingBottom: SP * 2 }}>{renderControls()}</View>}
    renderItem={(x: ListRenderItemInfo<Post>) => <Pressable style={[st.post, { backgroundColor: c.surface, borderColor: c.line }]} onPress={() => goWith('post', x.item.id)} accessibilityLabel={x.item.title}>
      <Avatar name={x.item.author()} tint={TINTS[(x.item.userId - 1) % TINTS.length]} size={40} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[k.body, { color: c.ink, fontWeight: '600' }]} numberOfLines={1}>{x.item.title}</Text>
        <Text style={[k.small, { color: c.muted }]} numberOfLines={2}>{x.item.body}</Text>
      </View>
    </Pressable>}
    getItemLayout={(d: Post[], i: number) => { return { length: 84, offset: 84 * i, index: i }; }}
    ListFooterComponent={() => <View style={st.footer}>{more ? <ActivityIndicator size="small" /> : <Text style={[k.small, { color: c.faint }]}>{posts.length >= TOTAL ? `All ${TOTAL} posts` : error !== '' ? error : `${posts.length} of ${TOTAL}`}</Text>}</View>}
    refreshing={refreshing} onRefresh={() => { setRefreshing(true); setError(''); load(1, []); }}
    onEndReached={() => { if (!more && posts.length < TOTAL) { setMore(true); setError(''); load(Math.floor(posts.length / PAGE) + 1, posts); } }} />;
}

/** The detail of a post, from the posts already loaded. */
export function PostScreen() {
  const c = theme();
  const p = cache.find((q: Post) => q.id === nav.param);
  if (p === undefined) return <Screen><EmptyState icon="circle-alert" title={tr('Nothing here yet')} body="This post is not loaded." /></Screen>;
  const post = p as Post;
  return <Screen>
    <View style={[k.rowFlat, { gap: SP * 3 }]}>
      <Avatar name={post.author()} tint={TINTS[(post.userId - 1) % TINTS.length]} size={48} />
      <View style={{ gap: 2 }}><Text style={[k.heading, { color: c.ink }]}>{post.author()}</Text><Badge text={`#${post.id}`} tone="info" /></View>
    </View>
    <Text style={[k.title, { color: c.ink }]}>{post.title}</Text>
    <Text style={[k.body, { color: c.muted, lineHeight: 24 }]}>{post.body}</Text>
  </Screen>;
}

function LiveFeed() {
  const c = theme();
  const [items, setItems] = useState<FeedMessage[]>([]);
  const [state, setState] = useState('closed');
  const [draft, setDraft] = useState('');
  const feed = useRef<Feed | null>(null);
  const list = useRef<FeedMessage[]>([]);
  if (feed.current === null) {
    const f = new Feed();
    f.onMessage = (m: FeedMessage): void => { trace(`feed ${m.from}: ${m.text}`); list.current = [m].concat(list.current.slice(0, 199)); setItems(list.current); };   // newest first, 200 kept
    f.onState = (s: string): void => { trace(`feed ${s}`); setState(s); };
    feed.current = f;
    onLeave((): void => f.close());
  }
  const f = feed.current as Feed;
  const send = (): void => { if (draft.trim() === '' || state !== 'open') return; f.send(draft.trim()); setDraft(''); };
  return <View style={{ flex: 1 }}>
    <View style={[st.controls, { backgroundColor: c.surface, borderColor: c.line, marginHorizontal: SP * 4 }]}>
      <View style={k.rowFlat}>
        <View style={{ flex: 1, gap: 2 }}>
          <Badge text={state === 'open' ? tr('Connected') : state === 'connecting' ? '…' : tr('Disconnected')} tone={state === 'open' ? 'ok' : state === 'connecting' ? 'warn' : 'neutral'} dot={true} />
          <Text style={[k.tiny, { color: c.muted }]}>{f.kind()}</Text>
        </View>
        <ActionButton title={state === 'closed' ? tr('Connect') : tr('Disconnect')} kind={state === 'closed' ? 'primary' : 'secondary'} icon={state === 'closed' ? 'zap' : 'x'}
          onPress={() => { if (state === 'closed') f.connect(); else f.close(); }} />
      </View>
    </View>
    <FlatList data={items} keyExtractor={(m: FeedMessage) => `${m.id}`} style={{ marginTop: SP * 2 }}
      ListEmptyComponent={() => <EmptyState icon="radio-tower" title={tr('Disconnected')} body="Connect to start the ticker; what you send comes back as an echo." />}
      renderItem={(x: ListRenderItemInfo<FeedMessage>) => <View style={[st.msg, x.item.from === 'me' ? { alignSelf: 'flex-end', backgroundColor: c.accent } : { alignSelf: 'flex-start', backgroundColor: x.item.from === 'ticker' ? c.raised : c.infoSoft }]}>
        <Text style={[k.small, { color: x.item.from === 'me' ? c.accentInk : c.ink }]}>{x.item.text}</Text>
      </View>}
      getItemLayout={(d: FeedMessage[], i: number) => { return { length: 44, offset: 44 * i, index: i }; }} />
    <View style={[st.composer, { borderColor: c.line, backgroundColor: c.surface }]}>
      <TextInput style={[st.input, { backgroundColor: c.bg, color: c.ink, borderColor: c.line }]} value={draft} onChangeText={setDraft} placeholder={tr('Say something')}
        onSubmitEditing={send} editable={state === 'open'} accessibilityLabel={tr('Say something')} />
      <Pressable style={[st.send, { backgroundColor: state === 'open' && draft !== '' ? c.accent : c.raised }]} onPress={send} accessibilityLabel={tr('Send')}>
        <Icon name="send" size={18} color={() => theme().accentInk} />
      </Pressable>
    </View>
  </View>;
}

const st = StyleSheet.create({
  controls: { marginHorizontal: SP * 4, padding: SP * 3, gap: SP * 2, borderRadius: 16, borderWidth: 1 },
  post: { flexDirection: 'row', alignItems: 'center', gap: SP * 3, marginHorizontal: SP * 4, marginBottom: SP * 2, padding: SP * 3, height: 76, borderRadius: 16, borderWidth: 1 },
  footer: { height: 56, alignItems: 'center', justifyContent: 'center' },
  msg: { marginHorizontal: SP * 4, marginVertical: 4, paddingHorizontal: SP * 3, paddingVertical: SP * 2, borderRadius: 14, maxWidth: 320 },
  composer: { flexDirection: 'row', gap: SP * 2, padding: SP * 3, borderTopWidth: 1 },
  input: { flex: 1, height: 42, borderRadius: R_CONTROL, borderWidth: 1, paddingHorizontal: SP * 3, fontSize: T_BODY },
  send: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
});
