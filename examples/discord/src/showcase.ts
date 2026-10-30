// DISCORD_DEMO=showcase (tests/t1/discord.sh): #showcase of the fake Discord, one message of each kind of content. It logs what each message
// carries, waits for the link preview that comes as an update and for the reactions of others, reacts and votes, opens the thread and the
// forum, sees a new thread come, opens the pins, pins a message, follows a reply to its message, reads the thread and a forum post beside
// their channel, jumps to a message of #general older than its loaded page, then shows #showcase again with its pins for the last frame (the
// golden picture) and quits.
import { quit } from 'zinc:gfx';
import { store, Message, Attachment, Channel } from './state';
import { Embed, Reaction, Component } from './content';
import { parse, describe } from './markdown';
import { picturesLoading } from './services/cdn';
import { names } from './components/Markdown';
import { listed } from './components/ChannelList';
import { isThread } from './constants';

function until(cond: () => boolean): Promise<void> {
  return new Promise<void>((done: () => void) => { const t = setInterval(() => { if (cond()) { clearInterval(t); done(); } }, 10); });
}
const wait = (ms: number): Promise<void> => new Promise<void>((done: () => void) => { setTimeout(done, ms); });
const count = (id: string): i32 => { const l = store.messages.get(id); return l !== undefined ? l.length : -1; };

/** One line of what a message carries. */
function summary(m: Message): string {
  const parts: string[] = [];
  if (m.system !== '') parts.push(`system "${describe(parse(m.system, names, true))}"`);
  if (m.replyTo !== '') parts.push(`reply "${m.replyTo}"${m.replyDeleted ? ' (deleted)' : ''}`);
  if (m.interaction !== '') parts.push(`command "${m.interaction}"`);
  if (m.bot) parts.push('app');
  if (m.content !== '' && m.system === '') parts.push(`text "${describe(parse(m.content, names, false))}"`);
  for (const a of m.attachments) parts.push(`${a.kind} ${a.filename} ${a.width}x${a.height}${a.spoiler ? ' spoiler' : ''}${a.description !== '' ? ` alt "${a.description}"` : ''}${a.kind === 'voice' ? ` ${a.duration}s` : ''}`);
  for (const s of m.stickers) parts.push(`sticker ${s.name}/${s.format}`);
  for (const e of m.embeds) parts.push(`embed ${e.type} "${e.title}" ${e.provider !== '' ? `(${e.provider}) ` : ''}fields ${e.fields.length}${e.thumbnail !== null ? ' thumb' : ''}${e.image !== null ? ' image' : ''}${e.video !== null ? ' video' : ''}`);
  const p = m.poll;
  if (p !== null) parts.push(`poll "${p.question}" ${p.answers.map((a) => `${a.text} ${a.count}${a.mine ? '*' : ''}`).join(', ')}`);
  for (const row of m.rows) parts.push(`row ${row.map((c: Component) => `${c.type === 2 ? 'button' : 'menu'} ${c.label}/${c.style}${c.disabled ? ' off' : ''}`).join(', ')}`);
  const t = m.thread;
  if (t !== null) parts.push(`thread ${t.name} ${t.count}`);
  const f = m.forwarded;
  if (f !== null) parts.push(`forwarded "${f.content}" ${f.attachments.length} files from ${f.channelId}`);
  if (m.reactions.length > 0) parts.push(`reactions ${m.reactions.map((r: Reaction) => `${r.name}${r.count}${r.me ? '*' : ''}`).join(' ')}`);
  return `show ${m.id}: ${parts.join('; ')}`;
}
const sidebar = (): string => store.channels().filter((c: Channel) => c.type !== 4 && listed(c)).map((c: Channel) => `${isThread(c.type) ? '↳' : ''}${c.name}${c.forum() ? '(forum)' : ''}`).join(', ');

export async function showcase(): Promise<void> {
  await until(() => store.stage === 'ready');
  store.selectGuild('200');
  store.selectChannel('305');
  await until(() => count('305') === 24);
  const list = store.messages.get('305') as Message[];
  const find = (id: string): Message => { for (const m of list) if (m.id === id) return m; return list[0]; };
  // the link's preview (a partial MESSAGE_UPDATE) and the reactions of the others
  await until(() => find('1001').embeds.length > 0 && find('1007').reactions.length === 3);
  const tada = find('1007').reactions[2];
  await store.react(find('1007'), tada);                       // mine on 🎉
  await store.vote(find('1009'), 1);
  await until(() => { const p = find('1009').poll; return p !== null && p.answers[1].count === 2; });   // Linus voted too
  for (const m of list) console.log(summary(m));
  console.log(`sidebar ${sidebar()}`);
  // the conversation (ZN-903): who may pin, the pins, a pin, a reply's reference followed, the thread read beside its channel
  console.log(`pins allowed: showcase ${store.canPin('305')}, welcome ${store.canPin('311')}, DM ${store.canPin('400')}`);
  store.togglePins();
  await until(() => store.pins.has('305'));
  await store.pin(find('1017'));
  await until(() => (store.pins.get('305') as Message[]).length === 2);
  console.log(`pins shown: ${(store.pins.get('305') as Message[]).map((m: Message) => m.id).join(', ')}, 1017 pinned ${find('1017').pinned}`);
  await store.jumpTo(find('1017').replyId);
  store.openThread('306');
  await until(() => count('306') === 3);
  const first = (store.messages.get('306') as Message[])[0];
  console.log(`thread 306: ${count('306')} messages, first by ${first.author}: ${first.content} (type ${first.type})`);
  store.selectChannel('307');
  await until(() => store.posts('307').length === 2 && store.findChannel('310') !== null);
  console.log(`forum 307: ${store.posts('307').map((c: Channel) => c.name).join(', ')}; preview "${(store.previews.get('308') as Message).content}"`);
  store.openThread('308');
  await until(() => count('308') >= 0);
  // a message older than the loaded page of #general: the page around it is fetched once and joins the list
  store.selectChannel('302');
  await until(() => count('302') === 50);
  await store.jumpTo('100000');
  console.log(`jump: #general holds ${count('302')}, older than the present ${store.showingOlder()}`);
  await store.jumpTo('100000');                                 // loaded now: no request
  console.log(`sidebar ${sidebar()}`);
  store.selectChannel('305');
  store.togglePins();                                           // kept: no request; the pins are in the last frame
  await wait(150);                                              // a frame shows the rows, which ask for their pictures
  await until(() => picturesLoading() === 0);
  await wait(150);
  quit();
}
