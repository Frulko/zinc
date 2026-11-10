import { createSignal, createMemo } from 'zinc:ui/solid';

export interface Note { id: i32; title: string; body: string; tags: string[]; pinned: boolean }
export enum Pane { List, Detail }

export function createNotes() {
  const [notes, setNotes] = createSignal<Note[]>([
    { id: 1, title: 'Saturday workshop', tags: ['Personal'], pinned: true,
      body: '# Saturday workshop\n\nA quiet morning to make something by hand.\n\n## Bring along\n- [ ] Sketchbook and a pencil\n- [x] Small pieces of wood\n- [ ] Tea for the table\n\n**Start small.** Leave room for a happy accident.' },
    { id: 2, title: 'A pocket weather station', tags: ['Ideas', 'Making'], pinned: false,
      body: '# A pocket weather station\n\nTry a tiny display beside the window.\n\n- Temperature and humidity\n- A simple line for the last hour\n- One button to dim the screen\n\n```ts\nconst interval = 60;\n```' },
    { id: 3, title: 'Things worth keeping', tags: ['Personal'], pinned: false,
      body: '# Things worth keeping\n\nA good walk. A repaired radio. Lunch with a friend.\n\n> Pay attention to the ordinary things.' },
    { id: 4, title: 'Studio handover', tags: ['Work'], pinned: false,
      body: '# Studio handover\n\n## Before Friday\n- [ ] Label the cables\n- [ ] Photograph the finished panel\n- [x] Book the shared table\n\nThe spare keys are in the blue drawer.' }
  ]);
  const [selected, setSelected] = createSignal<i32>(1);
  const [query, setQuery] = createSignal('');
  const [tag, setTag] = createSignal('');
  const [pane, setPane] = createSignal(Pane.List);
  const [preview, setPreview] = createSignal<i32>(0);
  const [deleting, setDeleting] = createSignal(false);
  let nextId: i32 = 5;
  const current = createMemo<Note | null>(() => notes().find((note: Note) => note.id === selected()) ?? null, null);
  const tags = createMemo<string[]>(() => {
    const result: string[] = [];
    for (const note of notes()) for (const name of note.tags) if (result.indexOf(name) < 0) result.push(name);
    return result;
  }, []);
  const visible = createMemo<Note[]>(() => {
    const needle = query().trim().toLowerCase();
    const matches = notes().filter((note: Note) => (tag() === '' || note.tags.indexOf(tag()) >= 0) &&
      (note.title + ' ' + note.body + ' ' + note.tags.join(' ')).toLowerCase().includes(needle));
    return matches.filter((note: Note) => note.pinned).concat(matches.filter((note: Note) => !note.pinned));
  }, []);
  const update = (title: string, body: string, names: string[]): void => {
    setNotes(notes().map((note: Note) => note.id === selected() ? { id: note.id, title, body, tags: names, pinned: note.pinned } : note));
    if (tag() !== '' && tags().indexOf(tag()) < 0) setTag('');
  };
  const select = (id: i32): void => {
    setSelected(id);
    setPane(Pane.Detail);
  };
  const create = (): void => {
    const id = nextId++;
    setNotes(notes().concat([{ id, title: 'Untitled note', body: '', tags: [], pinned: false }]));
    setQuery('');
    setTag('');
    setPreview(1);
    select(id);
  };
  const pin = (): void => setNotes(notes().map((note: Note) => note.id === selected() ? { id: note.id, title: note.title, body: note.body, tags: note.tags, pinned: !note.pinned } : note));
  const remove = (): void => {
    const remaining = notes().filter((note: Note) => note.id !== selected());
    setNotes(remaining);
    setSelected(remaining.length > 0 ? remaining[0].id : -1);
    setDeleting(false);
    setPane(Pane.List);
    if (tag() !== '' && tags().indexOf(tag()) < 0) setTag('');
  };
  return { notes, current, selected, query, setQuery, tag, setTag, tags, visible, pane, setPane, preview, setPreview, deleting, setDeleting, select, create, update, pin, remove };
}
export type Notes = ReturnType<typeof createNotes>;
