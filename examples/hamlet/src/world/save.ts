import * as storage from 'zinc:storage';
import { SAVE_KEY } from '../constants';
import { world } from './world';
import { snapshot, restore, Restored, SaveCheck } from './snapshot';

// The current village in zinc:storage. The text itself is made and read by world/snapshot.ts, which knows nothing of storage (a server reuses it).

export function saveGame(): void {
  world.saveDirty = false; world.lastSave = world.time;
  try { storage.set(SAVE_KEY, snapshot()); }
  catch (error) { console.warn('The village could not be saved: ' + error.message); }
}

/** Loads the saved village. A save this build refuses (a newer or a too old version) is kept under its own key before the new village's autosave overwrites the slot. */
export function loadGame(): Restored {
  let text = '';
  try { text = storage.get(SAVE_KEY); } catch (error) { text = ''; }
  if (text === '') return new Restored();
  const r = restore(text);
  if (r.check === SaveCheck.Future || r.check === SaveCheck.TooOld) {
    try { storage.set(SAVE_KEY + ':' + r.version, text); } catch (error) { console.warn('The refused save could not be kept: ' + error.message); }
  }
  return r;
}
export function eraseSave(): void {
  try { storage.remove(SAVE_KEY); } catch (error) { console.warn('The save could not be erased: ' + error.message); }
}
