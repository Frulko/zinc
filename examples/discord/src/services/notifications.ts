// The system's side of the notifications: a notification per channel (the next one of the channel replaces it), a click opens the channel
// and brings the window to the front, and the Dock's badge is the count of mentions. Which message notifies is the store's (state.ts, notify.ts).
import * as notification from 'zinc:system/notification';
import * as dock from 'zinc:system/dock';
import * as win from 'zinc:system/window';
import { store, Message, Channel } from '../state';

let badge = '';
/** The last notification shown (the tests click it). */
export let last: notification.Notification | null = null;

/** "#general · Zinc Lab", or the DM's name. */
function where(c: Channel): string {
  if (c.guildId === '') return c.name;
  const g = store.findGuild(c.guildId);
  return g !== null ? `#${c.name} · ${g.name}` : `#${c.name}`;
}
/** The text of a message as a notification shows it: mentions by name, a file when there is no text. */
function body(m: Message): string {
  let t = m.content;
  for (const id of m.mentions) t = t.split(`<@${id}>`).join(`@${store.userName(id)}`).split(`<@!${id}>`).join(`@${store.userName(id)}`);
  if (t === '' && m.attachments.length > 0) t = m.attachments.length === 1 ? `Sent ${m.attachments[0].filename}` : `Sent ${m.attachments.length} files`;
  return t.length > 200 ? `${t.slice(0, 199)}…` : t;
}

export function startNotifications(): void {
  if (notification.isSupported()) {
    notification.requestPermission();
    store.notifier = (m: Message, c: Channel): void => {
      const o = new notification.Options(m.author);
      o.id = `channel-${c.id}`; o.group = c.id; o.subtitle = where(c); o.body = body(m);
      notification.show(o).then((n: notification.Notification): void => {
        last = n;
        n.onClick((): void => { store.open(c.id); win.focus(); });
      });
    };
  }
  if (dock.isSupported()) store.onChange((): void => {
    const n = store.totalMentions(), text = n > 0 ? `${n}` : '';
    if (text !== badge) { badge = text; dock.setBadge(text); }
  });
}
