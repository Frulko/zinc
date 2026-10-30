// The #showcase channel of the fake Discord (fake-discord.ts): one message of each kind of content (docs/reports/discord-message-content.md
// section 15), the thread #release-talk, the forum #ideas and its posts. Pictures are on the fake CDN (cdn), which serves the test PNGs.
const stamp = (minute: i32): string => `2026-10-30T10:${minute < 10 ? '0' : ''}${minute}:00.000000+00:00`;

export const grace: any = { id: '101', username: 'grace', global_name: 'Grace', avatar: 'av101' };
export const linus: any = { id: '102', username: 'linus', global_name: null, avatar: null };
const katherine: any = { id: '103', username: 'katherine', global_name: 'Katherine', avatar: 'av103' };
const ada: any = { id: '100', username: 'ada', global_name: 'Ada', avatar: null };
const ci: any = { id: '901', username: 'ci', global_name: 'CI', avatar: null, bot: true };
const rollbot: any = { id: '900', username: 'rollbot', global_name: null, avatar: null, bot: true };

/** The channels it adds to the server Zinc Lab: #showcase, the forum #ideas, and the active threads (GUILD_CREATE's threads). */
export const channels: any[] = [
  { id: '305', type: 0, name: 'showcase', position: 2, parent_id: '301', last_message_id: '1023' },
  { id: '307', type: 15, name: 'ideas', position: 3, parent_id: '301', available_tags: [{ id: '71', name: 'feature' }, { id: '72', name: 'ui' }] },
];
export const threads: any[] = [
  { id: '306', type: 11, name: 'release talk', parent_id: '305', message_count: 2, last_message_id: '1102' },
  { id: '308', type: 11, name: 'Dark mode everywhere', parent_id: '307', message_count: 5, last_message_id: '1202', applied_tags: ['71', '72'] },
];
/** THREAD_CREATE pushed once the forum's posts were asked for. */
export const newThread: any = { id: '310', type: 11, name: 'hotfix', parent_id: '305', guild_id: '200', message_count: 0, last_message_id: '310', newly_created: true };
/** The forum's posts (GET /channels/307/threads/search). */
export const posts = (): any => ({
  threads: [threads[1], { id: '309', type: 11, name: 'Plugins for MIDI', parent_id: '307', message_count: 1, last_message_id: '1210', applied_tags: ['71'] }],
  first_messages: [msg('308', '308', grace, 'What if every app had a dark theme by default?', 1), msg('309', '309', linus, 'A MIDI plugin for the synth demos.', 2)],
  members: [], has_more: false, total_results: 2,
});

function msg(id: string, channel: string, author: any, content: string, minute: i32): any {
  return { id: id, channel_id: channel, guild_id: '200', type: 0, flags: 0, author: author, content: content, timestamp: stamp(minute), edited_timestamp: null,
    attachments: [], embeds: [], mentions: [] };
}
/** A thread's history: its starter (type 21, the message it started from) and two answers. */
export const threadHistory = (): any[] => {
  const starter = msg('1100', '306', grace, '', 40);
  starter.type = 21; starter.referenced_message = msg('1014', '305', grace, 'Let us talk about the release here.', 14);
  return [msg('1102', '306', linus, 'Tagged v1.0 an hour ago.', 42), msg('1101', '306', ada, 'Notes are in the wiki.', 41), starter];   // newest first
};

/** The messages of #showcase, oldest first. `now`: the server's clock in seconds (a relative timestamp and the poll's end). */
export function showcase(cdn: string, now: number): any[] {
  const pic = (name: string, w: i32, h: i32): any => ({ url: `https://example.com/${name}.png`, proxy_url: `${cdn}/external/${name}.png`, width: w, height: h });
  const file = (id: string, name: string, type: string, size: i32): any =>
    ({ id: id, filename: name, size: size, content_type: type, url: `${cdn}/attachments/305/${id}/${name}?ex=${Math.floor(now + 86400).toString(16)}&is=0&hm=sig2&`,
      proxy_url: `${cdn}/attachments/305/${id}/${name}?ex=${Math.floor(now + 86400).toString(16)}&is=0&hm=sig2&` });
  const out: any[] = [];
  const add = (m: any): any => { out.push(m); return m; };

  const rich = add(msg('1000', '305', ci, 'Build finished', 0));
  rich.embeds = [{ type: 'rich', title: 'Release 1.2', url: 'https://zinc.dev/r/1.2', description: 'Notes: **faster** layout and `zinc dev`.', color: 5793266,
    author: { name: 'CI' }, fields: [{ name: 'Build', value: 'ok', inline: true }, { name: 'Tests', value: '412', inline: true }, { name: 'Changes', value: 'Text runs, pictures in text', inline: false }],
    thumbnail: pic('thumb', 80, 80), image: pic('banner', 400, 160), footer: { text: 'zinc ci' }, timestamp: '2026-10-30T09:00:00.000Z' }];
  add(msg('1001', '305', grace, 'https://zinc.dev/blog/v1', 1));                 // its preview comes in a MESSAGE_UPDATE (linkPreview)
  const gif = add(msg('1002', '305', linus, 'https://tenor.com/view/cat-12345', 2));
  gif.embeds = [{ type: 'gifv', url: 'https://tenor.com/view/cat-12345', provider: { name: 'Tenor', url: 'https://tenor.com' }, thumbnail: pic('tenor', 300, 170),
    video: { url: 'https://media.tenor.com/AAA/tenor.mp4', width: 300, height: 170 } }];
  const yt = add(msg('1003', '305', grace, 'Watch this https://www.youtube.com/watch?v=dQw4w9WgXcQ', 3));
  yt.embeds = [{ type: 'video', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', title: 'Zinc in 100 seconds', color: 16711680, provider: { name: 'YouTube' },
    author: { name: 'Zinc' }, thumbnail: { url: 'https://i.ytimg.com/vi/x/maxresdefault.jpg', proxy_url: `${cdn}/external/yt.png`, width: 1280, height: 720 },
    video: { url: 'https://www.youtube.com/embed/dQw4w9WgXcQ', width: 1280, height: 720 } }];
  const files = add(msg('1004', '305', ada, 'Files of the release', 4));
  const shot = file('1104', 'screen.png', 'image/png', 120); shot.width = 160; shot.height = 120; shot.description = 'The new settings screen';
  const clip = file('1105', 'demo.mp4', 'video/mp4', 12582912); clip.width = 1280; clip.height = 720;
  files.attachments = [clip, file('1106', 'theme.mp3', 'audio/mpeg', 3355443), file('1107', 'notes.pdf', 'application/pdf', 2621440), shot];
  const spoiler = add(msg('1005', '305', linus, '', 5));
  const hidden = file('1108', 'SPOILER_photo.png', 'image/png', 120); hidden.width = 160; hidden.height = 120; hidden.flags = 8;
  spoiler.attachments = [hidden];
  const voice = add(msg('1006', '305', grace, '', 6));
  const ogg = file('1109', 'voice-message.ogg', 'audio/ogg', 33000); ogg.duration_secs = 4.2;
  ogg.waveform = 'f5250eTx9/Xs3MetkHJVOiQUCgcMGCpCXXuZtc7i8Pb27t/KsJR2WT4nFQsHCxYoP1p3lbHL3+729u/hzbSYeg==';   // 64 samples of a sine
  voice.flags = 8192; voice.attachments = [ogg];
  const reacted = add(msg('1007', '305', linus, 'Reactions here', 7));
  reacted.reactions = [{ count: 3, me: true, emoji: { id: null, name: '👍' } }, { count: 1, me: false, emoji: { id: '77', name: 'zinc' } }];
  const sticker = add(msg('1008', '305', grace, '', 8));
  sticker.sticker_items = [{ id: '601', name: 'wave', format_type: 1 }, { id: '602', name: 'dance', format_type: 2 }, { id: '603', name: 'party', format_type: 3 }, { id: '604', name: 'cat', format_type: 4 }];
  const poll = add(msg('1009', '305', grace, '', 9));
  poll.poll = { question: { text: 'Lunch?' }, answers: [{ answer_id: 1, poll_media: { text: 'Pizza', emoji: { name: '🍕' } } }, { answer_id: 2, poll_media: { text: 'Sushi' } }],
    expiry: new Date((now + 23.5 * 3600) * 1000).toISOString(), allow_multiselect: false, layout_type: 1,
    results: { is_finalized: false, answer_counts: [{ id: 1, count: 2, me_voted: false }, { id: 2, count: 1, me_voted: false }] } };
  const result = add(msg('1010', '305', grace, '', 10));
  result.type = 46; result.message_reference = { message_id: '1009', channel_id: '305' };
  result.embeds = [{ type: 'poll_result', fields: [{ name: 'poll_question_text', value: 'Coffee or tea?' }, { name: 'victor_answer_votes', value: '3' },
    { name: 'total_votes', value: '4' }, { name: 'victor_answer_text', value: 'Coffee' }] }];
  const join = add(msg('1011', '305', katherine, '', 11)); join.type = 7;
  const boost = add(msg('1012', '305', linus, '', 12)); boost.type = 8;
  const pin = add(msg('1013', '305', grace, '', 13)); pin.type = 6; pin.message_reference = { message_id: '1000', channel_id: '305' };
  const thread = add(msg('1014', '305', grace, 'release talk', 14));
  thread.type = 18; thread.flags = 32; thread.thread = { id: '306', name: 'release talk', message_count: 2 };
  const call = add(msg('1015', '305', grace, '', 15)); call.type = 3; call.call = { participants: ['101'], ended_timestamp: stamp(18) };
  const rename = add(msg('1016', '305', linus, 'showcase', 16)); rename.type = 4;
  const reply = add(msg('1017', '305', linus, 'Great release!', 17)); reply.type = 19;
  reply.message_reference = { type: 0, message_id: '1000', channel_id: '305' }; reply.referenced_message = rich;
  const orphan = add(msg('1018', '305', grace, 'Answering a message that is gone', 18)); orphan.type = 19;
  orphan.message_reference = { type: 0, message_id: '999', channel_id: '305' }; orphan.referenced_message = null;
  const fwd = add(msg('1019', '305', ada, '', 19));
  fwd.flags = 16384; fwd.message_reference = { type: 1, message_id: '903', channel_id: '302', guild_id: '200' };
  const forwardedPhoto = file('1110', 'photo.png', 'image/png', 120); forwardedPhoto.width = 160; forwardedPhoto.height = 120;
  fwd.message_snapshots = [{ message: { type: 0, flags: 0, content: 'Shipping the gateway today.', timestamp: '2026-10-30T09:12:00.000000+00:00', attachments: [forwardedPhoto], embeds: [], mentions: [] } }];
  const roll = add(msg('1020', '305', rollbot, 'Rolled **4** 🎲', 20));
  roll.type = 20; roll.interaction_metadata = { id: '7001', type: 2, name: 'roll', user: grace };
  const buttons = add(msg('1021', '305', rollbot, 'Again?', 21));
  buttons.components = [{ type: 1, components: [{ type: 2, style: 1, label: 'Roll again', custom_id: 'again' }, { type: 2, style: 5, label: 'Docs', url: 'https://zinc.dev/docs' },
    { type: 2, style: 4, label: 'Delete', custom_id: 'del', disabled: true }] }, { type: 1, components: [{ type: 3, custom_id: 'die', placeholder: 'Pick a die', options: [] }] }];
  add(msg('1022', '305', grace, `# Plan\n## Today\n- lists\n  - nested\n1. one\n2. two\nAt <t:1793352000:t> on <t:1793352000:D>, <t:${Math.floor(now + 11400)}:R>: run </roll dice:555>, read [the docs](<https://zinc.dev/docs> "Docs"), see <https://zinc.dev> and <id:customize>, @everyone\n-# small print\n> quoted\n> twice`, 22));
  const unknown = add(msg('1023', '305', linus, '', 23)); unknown.type = 99;
  return out;
}
/** The preview Discord resolves after the link of 1001 was sent: a partial MESSAGE_UPDATE (no author, no content). */
export const linkPreview = (cdn: string): any => ({ id: '1001', channel_id: '305', guild_id: '200', embeds: [{ type: 'article', url: 'https://zinc.dev/blog/v1',
  title: 'Zinc 1.0', description: 'One program on a desktop, a Raspberry Pi and an ESP32.', provider: { name: 'zinc.dev' },
  thumbnail: { url: 'https://zinc.dev/og.png', proxy_url: `${cdn}/external/og.png`, width: 80, height: 80 } }] });
