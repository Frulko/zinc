import { createSignal } from 'zinc:ui/solid';
import { Document, TodoList, Task, initialDocument, readDocument } from './model';
import { loadDocument, saveDocument } from './services/document';

let document = initialDocument();
const [revision, setRevision] = createSignal(0);
export const [screen, setScreen] = createSignal('tasks');
export const [selectedId, selectEntry] = createSignal('intro-0');
export const [editingId, setEditingId] = createSignal('');
export const [draft, setDraft] = createSignal('');
export const [insertBefore, setInsertBefore] = createSignal('');
export const [errorMessage, setErrorMessage] = createSignal('');
export const [keyboardSelection, setKeyboardSelection] = createSignal(false);
const undoHistory: string[] = [];
const redoHistory: string[] = [];

export function initialize(): void {
  document = loadDocument();
  setScreen(document.activeList === '' ? 'lists' : 'tasks');
  setRevision(revision() + 1);
}

export function currentDocument(): Document {
  revision();
  return document;
}

export function activeList(): TodoList | null {
  revision();
  for (const list of document.lists) if (list.id === document.activeList) return list;
  return null;
}

export function visibleTasks(): Task[] {
  const list = activeList();
  if (list === null) return [];
  return list.tasks.filter((task: Task) => !task.completed).concat(list.tasks.filter((task: Task) => task.completed));
}

export function visibleIds(): string[] {
  if (screen() === 'lists') return currentDocument().lists.map((list: TodoList) => list.id);
  return visibleTasks().map((task: Task) => task.id);
}

function persistChange(before: string): boolean {
  let saved = true;
  try {
    saveDocument(document);
    undoHistory.push(before);
    if (undoHistory.length > 40) undoHistory.shift();
    redoHistory.length = 0;
    setErrorMessage('');
  } catch (error) {
    saved = false;
    document = readDocument(before);
    setErrorMessage('Could not save: ' + error.message);
  }
  setRevision(revision() + 1);
  return saved;
}

export function openList(id: string): void {
  const previous = document.activeList;
  document.activeList = id;
  try {
    saveDocument(document);
    setErrorMessage('');
  } catch (error) {
    document.activeList = previous;
    setErrorMessage('Could not save: ' + error.message);
    return;
  }
  setScreen(id === '' ? 'lists' : 'tasks');
  setEditingId('');
  const ids = visibleIds();
  selectEntry(ids.length > 0 ? ids[0] : '');
  setRevision(revision() + 1);
}

export function showLists(): void {
  openList('');
}

export function beginCreate(initialText: string = '', before: string = ''): void {
  if (screen() === 'themes') return;
  setInsertBefore(before);
  setDraft(initialText);
  setEditingId('new');
}

export function editEntry(id: string): void {
  selectEntry(id);
  if (screen() === 'lists') {
    openList(id);
    return;
  }
  const task = visibleTasks().find((item: Task) => item.id === id);
  if (task === undefined) return;
  setDraft(task.title);
  setEditingId(id);
}

export function renameList(): void {
  const list = activeList();
  if (list === null) return;
  setDraft(list.title);
  setEditingId('list-title');
}

export function commitEdit(): void {
  if (editingId() === '') return;
  const title = draft().trim();
  if (title === '') {
    setEditingId('');
    return;
  }
  const before = JSON.stringify(document);
  const edited = editingId();
  const list = activeList();
  if (editingId() === 'list-title' && list !== null) list.title = title;
  else if (editingId() === 'new') {
    const id = 'item-' + document.nextId.toString();
    document.nextId++;
    if (screen() === 'lists') document.lists.push(new TodoList(id, title));
    else if (list !== null) {
      const task = new Task(id, title);
      const position = list.tasks.findIndex((item: Task) => item.id === insertBefore());
      if (position < 0) list.tasks.push(task);
      else list.tasks.splice(position, 0, task);
    }
    selectEntry(id);
  } else if (list !== null) {
    for (const task of list.tasks) if (task.id === editingId()) task.title = title;
  }
  setEditingId('');
  if (!persistChange(before)) setEditingId(edited);
}

export function toggleTask(id: string): void {
  if (screen() === 'lists') {
    openList(id);
    return;
  }
  const list = activeList();
  if (list === null) return;
  const before = JSON.stringify(document);
  for (const task of list.tasks) if (task.id === id) task.completed = !task.completed;
  persistChange(before);
}

export function deleteEntry(id: string): void {
  const before = JSON.stringify(document);
  if (screen() === 'lists') document.lists = document.lists.filter((list: TodoList) => list.id !== id);
  else {
    const list = activeList();
    if (list === null) return;
    list.tasks = list.tasks.filter((task: Task) => task.id !== id);
  }
  persistChange(before);
  const ids = visibleIds();
  selectEntry(ids.length > 0 ? ids[0] : '');
}

export function moveEntry(id: string, targetIndex: number): void {
  const ids = visibleIds();
  const sourceIndex = ids.indexOf(id);
  const destination = Math.max(0, Math.min(ids.length - 1, Math.round(targetIndex)));
  if (sourceIndex < 0 || sourceIndex === destination) return;
  const before = JSON.stringify(document);
  if (screen() === 'lists') {
    const list = document.lists.splice(sourceIndex, 1)[0];
    document.lists.splice(destination, 0, list);
  } else {
    const list = activeList();
    if (list === null) return;
    const tasks = visibleTasks();
    const task = tasks.splice(sourceIndex, 1)[0];
    tasks.splice(destination, 0, task);
    list.tasks = tasks;
  }
  persistChange(before);
}

export function clearCompleted(): void {
  const list = activeList();
  if (list === null || !list.tasks.some((task: Task) => task.completed)) return;
  const before = JSON.stringify(document);
  list.tasks = list.tasks.filter((task: Task) => !task.completed);
  persistChange(before);
}

export function chooseTheme(theme: string): void {
  const list = activeList();
  if (list === null) return;
  const before = JSON.stringify(document);
  list.theme = theme;
  persistChange(before);
  setScreen('tasks');
}

export function undo(redo: boolean = false): void {
  const history = redo ? redoHistory : undoHistory;
  const other = redo ? undoHistory : redoHistory;
  if (history.length === 0) return;
  const saved = JSON.stringify(document);
  const restored = readDocument(history[history.length - 1]);
  try {
    saveDocument(restored);
    other.push(saved);
    history.pop();
    document = restored;
    setScreen(document.activeList === '' ? 'lists' : 'tasks');
    setEditingId('');
    setRevision(revision() + 1);
  } catch (error) {
    setErrorMessage('Could not save: ' + error.message);
  }
}
