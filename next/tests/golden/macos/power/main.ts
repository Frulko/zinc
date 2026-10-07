import * as system from 'zinc:system';
import * as power from 'zinc:system/power';
import * as clipboard from 'zinc:system/clipboard';

const events: string[] = [];
power.onPower((e: string) => { events.push(e); });
const b = power.battery();
console.log('battery', typeof b.percent === 'number' && b.percent >= 0 && b.percent <= 100 ? 'valid' : 'invalid', 'present', b.present);
console.log('idle seconds ok', power.idleSeconds() >= 0);
console.log('dark is a boolean', power.isDark() === true || power.isDark() === false);
// the notifications the system posts on sleep, wake and lock, posted by hand
for (const e of ['suspend', 'resume', 'lock', 'unlock']) system.call('power.simulate', { event: e });
// a sleep blocker is a real IOKit assertion
const lock = power.preventSleep('system', 'zinc selftest');
// rich clipboard round trips (the previous clipboard is restored by the test script)
clipboard.writeHtml('<b>bold</b>', 'bold');
console.log('html', clipboard.readHtml().includes('<b>bold</b>'));
const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
clipboard.writeImage(png);
console.log('image', clipboard.readImage().length > 40);
clipboard.writeFiles(['/tmp', '/usr']);
console.log('files', JSON.stringify(clipboard.readFiles()));
setTimeout(() => {
  console.log('events', JSON.stringify(events));
  console.log('assertion token', lock.token > 0);
  console.log('PMSET ' + lock.token);   // the test greps pmset while the lock is held
}, 400);
setTimeout(() => { lock.release(); system.quit(0); }, 2500);
