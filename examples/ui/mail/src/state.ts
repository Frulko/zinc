import { createSignal } from 'zinc:ui/solid';
import { Folder, Message, sampleMessages } from './data';
export function createMailbox() {
  const [messages, setMessages] = createSignal<Message[]>(sampleMessages());
  const [folder, setFolder] = createSignal<Folder>(Folder.Inbox);
  const [query, setQuery] = createSignal('');
  const [selectedId, setSelectedId] = createSignal('mail-1');
  const [notice, setNotice] = createSignal('Fictional mail · changes last until this window closes');
  const [to, setTo] = createSignal('');
  const [subject, setSubject] = createSignal('');
  const [body, setBody] = createSignal('');
  const [error, setError] = createSignal('');
  let nextId = 7;
  const matchesFolder = (mail: Message, target: Folder): boolean => target === Folder.Starred ? mail.starred : mail.folder === target;
  const visible = (): Message[] => {
    const needle = query().trim().toLowerCase();
    return messages().filter((mail: Message) => matchesFolder(mail, folder()) && (mail.name + ' ' + mail.from + ' ' + mail.to + ' ' + mail.subject + ' ' + mail.body).toLowerCase().includes(needle));
  };
  const selected = (): Message | null => messages().find((mail: Message) => mail.id === selectedId() && visible().some((item: Message) => item.id === mail.id)) ?? null;
  const select = (id: string): void => {
    if (!visible().some((mail: Message) => mail.id === id)) return;
    setSelectedId(id);
    setMessages(messages().map((mail: Message) => mail.id === id ? { ...mail, unread: false } : mail));
  };
  const navigate = (target: Folder): void => { setFolder(target); setQuery(''); setSelectedId(''); };
  const toggleStar = (): void => {
    const mail = selected(); if (mail === null) return;
    setMessages(messages().map((item: Message) => item.id === mail.id ? { ...item, starred: !item.starred } : item));
    setNotice(mail.starred ? 'Star removed' : 'Message starred');
  };
  const toggleRead = (): void => {
    const mail = selected(); if (mail === null) return;
    setMessages(messages().map((item: Message) => item.id === mail.id ? { ...item, unread: !item.unread } : item));
    setNotice(mail.unread ? 'Marked as read' : 'Marked as unread');
  };
  const archive = (): void => {
    const mail = selected(); if (mail === null) return;
    const target = mail.folder === Folder.Archive ? Folder.Inbox : Folder.Archive;
    setMessages(messages().map((item: Message) => item.id === mail.id ? { ...item, folder: target } : item));
    setNotice(target === Folder.Inbox ? 'Moved to Inbox' : 'Moved to Archive');
  };
  const compose = (reply: boolean): void => {
    const mail = selected();
    setTo(reply && mail !== null ? (mail.from === 'alex@example.com' ? mail.to : mail.from) : '');
    setSubject(reply && mail !== null ? (mail.subject.startsWith('Re: ') ? mail.subject : 'Re: ' + mail.subject) : '');
    setBody(''); setError('');
  };
  const saveCopy = (): boolean => {
    const recipient = to().trim();
    const at = recipient.indexOf('@');
    if (at < 1 || at !== recipient.lastIndexOf('@') || recipient.indexOf('.', at + 2) < 0 || recipient.endsWith('.') || /[\s,;<>]/.test(recipient)) { setError('Enter one address, such as maya@example.com.'); return false; }
    if (subject().trim() === '' || body().trim() === '') { setError('Add a subject and a message before saving.'); return false; }
    const id = 'mail-' + String(nextId++);
    setMessages([{ id, name: 'Alex Morgan', from: 'alex@example.com', to: recipient, subject: subject().trim(), body: body().trim(), date: 'Just now', folder: Folder.Sent, unread: false, starred: false }].concat(messages()));
    navigate(Folder.Sent); setSelectedId(id); setError('');
    setNotice('Copy saved to Sent · nothing was sent externally');
    return true;
  };
  return { messages, folder, query, setQuery, visible, selectedId, selected, select, navigate, toggleStar, toggleRead, archive, notice, to, setTo, subject, setSubject, body, setBody, error, compose, saveCopy,
    count: (target: Folder): number => messages().filter((mail: Message) => matchesFolder(mail, target)).length };
}
export type Mailbox = ReturnType<typeof createMailbox>;
