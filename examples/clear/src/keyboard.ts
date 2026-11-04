import * as ui from 'zinc:ui';
import { rowNode } from './components/ClearRow';
import { selectedId, selectEntry, editingId, screen, setScreen, visibleIds,
  beginCreate, editEntry, toggleTask, deleteEntry, moveEntry, showLists, clearCompleted, undo, setKeyboardSelection } from './state';

export function handleShortcut(event: ui.KeyEvent): void {
  if (editingId() !== '') return;
  const ids = visibleIds();
  let index = ids.indexOf(selectedId());
  if (index < 0) index = 0;
  const id = ids.length > 0 ? ids[index] : '';

  if (event.primary && event.key === 'z') undo(event.shift);
  else if (event.primary && event.key === 'n') beginCreate();
  else if (event.primary && event.key === 'Backspace') clearCompleted();
  else if (event.key === 'Escape' || event.key === 'ArrowLeft') {
    if (screen() === 'themes') setScreen('tasks');
    else showLists();
  } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
    const direction = event.key === 'ArrowUp' ? -1 : 1;
    setKeyboardSelection(true);
    if (event.alt && id !== '') moveEntry(id, index + direction);
    else selectEntry(ids.length > 0 ? ids[Math.max(0, Math.min(ids.length - 1, index + direction))] : '');
    revealSelection();

  } else if (event.key === 'Enter' || event.key === 'ArrowRight') {
    if (id !== '') editEntry(id);
    else beginCreate();
  } else if (event.key === ' ' && id !== '') toggleTask(id);
  else if ((event.key === 'Delete' || event.key === 'Backspace') && id !== '') deleteEntry(id);
  else return;
  event.preventDefault();
}

export function installKeyboard(): void {
  ui.onKey(handleShortcut);
}

let scrollContainer: i32 = -1;
export function setScrollContainer(node: i32): void { scrollContainer = node; }

function revealSelection(): void {
  const row = rowNode(selectedId());
  if (row < 0 || scrollContainer < 0) return;
  const item = ui.screenBox(row);
  const viewport = ui.screenBox(scrollContainer);
  const top = ui.scrollTop(scrollContainer);
  if (item[1] < viewport[1]) ui.scrollTo(scrollContainer, 0, top + item[1] - viewport[1]);
  else if (item[1] + item[3] > viewport[1] + viewport[3]) {
    ui.scrollTo(scrollContainer, 0, top + item[1] + item[3] - viewport[1] - viewport[3]);
  }
}
