// What the toolbar and the menu bar both do: confirm a move to the Trash with an alert, ask a new folder's name in a sheet.
import { alert, sheet } from 'zinc:appkit';
import { selectedIds, trashSelected, addFolder } from './state';
import { NewFolderSheet } from './components/NewFolderSheet';

export async function confirmTrash(): Promise<void> {
  const count = selectedIds().length;
  if (count === 0) return;
  const what = count === 1 ? 'this file' : `these ${count} files`;
  const button = await alert({ message: `Move ${what} to the Trash?`, detail: 'Locked files stay where they are.', style: 'warning', buttons: ['Move to Trash', 'Cancel'] });
  if (button === 0) trashSelected();
}

export async function askNewFolder(): Promise<void> {
  const name = await sheet((close: (result: string) => void): i32 => NewFolderSheet({ onDone: close }));
  if (name !== '') addFolder(name);
}
