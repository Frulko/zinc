import * as system from 'zinc:system';
import * as dialog from 'zinc:system/dialog';
import * as fs from 'zinc:fs';

async function main(): Promise<void> {
  // nothing is allowed before the user picks: the fs scope is "user-picked"
  try { fs.readText('picked.txt'); console.log('read before picking: allowed'); } catch (e) { console.log('read before picking:', e.message.includes('outside the fs scope') ? 'refused' : e.message); }
  const o = new dialog.OpenOptions();
  o.title = 'Open'; o.filters = [new dialog.Filter('Text', ['txt'])];
  const picked = await dialog.open(o);
  console.log('picked', JSON.stringify(picked));
  console.log('read picked file:', JSON.stringify(fs.readText('picked.txt')));
  try { fs.readText('other.txt'); console.log('read other: allowed'); } catch (e) { console.log('read other:', e.message.includes('outside the fs scope') ? 'refused' : e.message); }
  const saved = await dialog.save(new dialog.SaveOptions());
  console.log('save with no answer', JSON.stringify(saved));
  const question = new dialog.MessageOptions('Quit without saving?');
  question.buttons = ['Quit', 'Cancel'];
  console.log('message button', await dialog.message(question));
  console.log('confirm', await dialog.confirm('Sure?'));
  system.quit(0);
}
main();
