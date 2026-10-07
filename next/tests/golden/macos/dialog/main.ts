import * as dialog from 'zinc:system/dialog';
import * as system from 'zinc:system';

async function main(): Promise<void> {
  // each dialog opens for real and ends by itself after 400 ms (NSApp abortModal): dismissed, so cancelled
  const o = new dialog.OpenOptions(); o.title = 'Selftest open'; o.abortMs = 400;
  console.log('open dismissed ->', JSON.stringify(await dialog.open(o)));
  const s = new dialog.SaveOptions(); s.title = 'Selftest save'; s.abortMs = 400;
  console.log('save dismissed ->', JSON.stringify(await dialog.save(s)));
  const m = new dialog.MessageOptions('Selftest message'); m.buttons = ['Yes', 'No']; m.abortMs = 400;
  console.log('message dismissed ->', await dialog.message(m));
  system.quit(0);
}
main();
