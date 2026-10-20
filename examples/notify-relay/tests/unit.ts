// tests/t0/notify_relay_unit.sh: Zinc Relay's decisions without a database or a tablet. The sender's image found in a record's
// property list (and its rank), the monogram (initials, its gradient, a 128 px PNG), the site of a web notification, the filters with
// the Focus policies, the Focus files' parsing. Made-up data only. Prints one line per failure and "unit ok" at the end.
import * as mac from 'zinc:notifymac';
import { utf8Encode, exit } from 'zinc:sys';
import { avatarSources, attachmentSources, communicationSender, initials, gradientOf, GRADIENTS, hostIn, domainOf, fromRecord, isImage, Notif, Settings, FocusState, keysOf, FOCUS_HOLD, FOCUS_FOLLOW } from '../src/model';
import { modesOf, activeOf } from '../src/focus';
import { extract } from '../src/emoji';
import { base64Decode, base64Encode } from 'zinc:web';

let failed = 0;
function check(ok: boolean, what: string): void { if (!ok) { console.log('FAIL ' + what); failed++; } }
function eq(got: string, want: string, what: string): void { check(got === want, what + ': got "' + got + '", want "' + want + '"'); }

// a 4x4 PNG (made by the native side: no image file is needed)
const PNG = mac.monogram('A', 0x112233, 0x445566, 4);
check(PNG.length > 8 && PNG[1] === 80, 'the monogram is a PNG');
const pngB64 = base64Encode(PNG);
check(isImage(base64Decode(pngB64.slice(0, 24))), 'a PNG is seen as an image');
check(!isImage(utf8Encode('hello, this is no image')), 'text is no image');

// a communication notification's record, as XML: the identity image ranks first, the app's icon last, an attachment by uuid between
function plistOf(xml: string): any { return mac.plist(utf8Encode('<?xml version="1.0" encoding="UTF-8"?><plist version="1.0">' + xml + '</plist>')); }
const rec = plistOf('<dict><key>app</key><string>net.whatsapp.WhatsApp</string><key>req</key><dict><key>titl</key><string>Anna Martin</string>' +
  '<key>body</key><string>On my way</string><key>durl</key><string>whatsapp://chat?jid=1</string><key>icon</key><data>' + pngB64 + '</data>' +
  '<key>atta</key><array><dict><key>uuid</key><string>0b1e2a3c-4d5e-6f70-8192-a3b4c5d6e7f8</string></dict></array>' +
  '<key>cnta</key><dict><key>identityImageData</key><data>' + pngB64 + '</data><key>note</key><data>aGVsbG8gd29ybGQgaGVsbG8gd29ybGQ=</data></dict></dict></dict>');
check(rec !== null, 'the XML record parses');
const src = avatarSources(rec);
check(src.length === 2, 'two image sources for the avatar (identity, icon), the attachment apart: ' + src.length);
check(src.length > 0 && src[0].startsWith('0:') && src[0].slice(2) === pngB64, 'the identity image first');
{ const att = attachmentSources(rec); check(att.length === 1 && att[0] === 'uuid:0B1E2A3C-4D5E-6F70-8192-A3B4C5D6E7F8', 'the attachment is what the message carries, never the avatar: ' + att.join(',')); }
check(src.length > 1 && src[1].startsWith('3:'), 'the icon last');
const n = fromRecord('ab', 'net.whatsapp.WhatsApp', rec, 800000000, true);
eq(n.kind, 'message', 'a messaging app gives a message');
eq(n.sender, 'Anna Martin', 'the sender is the title');
eq(n.url, 'whatsapp://chat?jid=1', 'the default action url');
check(n.date === 800000000 + 978307200, 'the date from 2001 to 1970');
const plain = fromRecord('cd', 'com.apple.mail', plistOf('<dict><key>req</key><dict><key>titl</key><string>Lunch</string><key>icon</key><data>' + pngB64 + '</data></dict></dict>'), 1, false);
eq(plain.kind, 'other', 'an app icon alone does not make a message');
{ const disc = avatarSources({ $keys: ['req'], req: { $keys: ['uncc'], uncc: { $plist: { $keys: ['$objects'], $objects: ['$null', '/tmp/zinc-avatar-without-extension', 'file:///tmp/a', 'intents-remote-image-proxy:?proxyIdentifier=X.png'] } } } });
  check(disc.length === 3 && disc[0] === '0:/tmp/zinc-avatar-without-extension' && disc[2].startsWith('0:intents-remote-image-proxy:'), 'a communication context names its image by a file without an extension: ' + disc.join(',')); }
{ const U = (n: number): string => '"<CFKeyedArchiverUID 0x600003>{value = ' + n + '}"';
  const uncc: any = JSON.parse('{"$plist":{"$keys":["$objects","$top"],"$top":{"$keys":["root"],"root":' + U(1) + '},"$objects":["$null",' +
    '{"$keys":["sender","displayName"],"sender":' + U(2) + ',"displayName":' + U(0) + '},' +
    '{"$keys":["displayName","handle","serviceName","cnContactIdentifier"],"displayName":' + U(3) + ',"handle":' + U(4) + ',"serviceName":' + U(5) + ',"cnContactIdentifier":' + U(6) + '},' +
    '"Léa Martin","+33600000000","SMS","ABCD-1234:ABPerson"]}}');
  const cs = communicationSender(uncc);
  check(cs[0] === 'Léa Martin' && cs[1] === '+33600000000' && cs[2] === 'ABCD-1234:ABPerson', 'the communication context names the sender: ' + cs.join('|'));
  check(communicationSender(null)[0] === '', 'no context, no sender'); }
{ const e = extract('Salut 👋🏽 ok 👨‍👩‍👧 🇫🇷 fin');
  check(e.images.length === 3 && e.text === 'Salut \uFFFC ok \uFFFC \uFFFC fin', 'emoji become placeholders with one image each (skin tone, family, flag): ' + e.images.length); }
eq(fromRecord('ef', 'com.apple.mobilesms', plistOf('<dict><key>req</key><dict><key>titl</key><string>Léa</string></dict></dict>'), 1, true).kind, 'message', 'Messages as Notification Center records it (lower case)');
check(!plain.presented, 'presented comes from the row');
eq(keysOf({ a: 1, b: { c: 2 }, d: 'x' }).join(','), 'a,b,d', 'keysOf');

// the monogram
eq(initials('Anna Martin'), 'AM', 'initials of two names');
eq(initials('anna'), 'A', 'initials of one name');
eq(initials('Jean-Pierre de la Fontaine'), 'JF', 'initials of the first and last words');
eq(initials('+33 6 12 34 56 78'), '#', 'a number has no initials');
eq(initials('  '), '?', 'no name');
const g = gradientOf('Anna Martin');
check(g === gradientOf('Anna Martin') && g >= 0 && g + 1 < GRADIENTS.length && g % 2 === 0, 'the gradient is stable and in range');
check(gradientOf('Ben') !== gradientOf('Anna Martin') || gradientOf('Chloé') !== gradientOf('Anna Martin'), 'names spread over the gradients');
const mono = mac.monogram(initials('Anna Martin'), GRADIENTS[g], GRADIENTS[g + 1], 128);
check(mono.length > 100 && mono[16] === 0 && mono[19] === 128 && mono[23] === 128, 'a 128 px monogram PNG');

// the site of web notifications
eq(hostIn('https://www.github.com/x'), 'github.com', 'a URL');
eq(hostIn('(news.example.org)'), 'news.example.org', 'in brackets');
eq(hostIn('hello'), '', 'a word');
eq(hostIn('v1.2'), '', 'a version is no host');
const web = new Notif('x', 'com.google.Chrome');
web.subtitle = 'github.com';
eq(domainOf(web, 'com.google.Chrome.framework.AlertNotificationService', 'Chrome'), 'github.com', 'Chrome: the subtitle');
const fx = new Notif('y', 'org.mozilla.firefox');
fx.subtitle = 'via ci.example.org';
eq(domainOf(fx, 'org.mozilla.firefox', 'Firefox'), 'ci.example.org', 'Firefox: via');
eq(domainOf(new Notif('z', 'x'), 'web.com.example.news', 'news'), 'news.example.com', 'Safari: web. ids');
eq(domainOf(fx, 'com.apple.mail', 'Mail'), '', 'an app has no site');

// the filters and Focus
const s = new Settings();
const m = new Notif('1', 'com.apple.mail');
m.date = 5;
eq(s.decide(m, 'Mail', '', new FocusState('', '')), '', 'relayed by default');
eq(s.decide(m, 'Mail', '', new FocusState('com.apple.focus.work', 'Travail')), '', 'relayed during a Focus by default');
s.focus = FOCUS_HOLD;
eq(s.decide(m, 'Mail', '', new FocusState('com.apple.focus.work', 'Travail')), 'focus', 'held during a Focus');
s.focusModes.set('com.apple.focus.work', FOCUS_FOLLOW);
eq(s.decide(m, 'Mail', '', new FocusState('com.apple.focus.work', 'Travail')), '', 'follow: what the Mac showed goes');
m.presented = false;
eq(s.decide(m, 'Mail', '', new FocusState('com.apple.focus.work', 'Travail')), 'focus', 'follow: what the Focus held stays');
eq(s.decide(m, 'Mail', '', new FocusState('com.apple.sleep.sleep-mode', 'Sommeil')), 'focus', 'another mode: the general choice');
s.setDomain('example.com', false);
eq(s.decide(m, 'Mail', 'news.example.com', new FocusState('', '')), 'site blocked', 'a blocked site blocks its subdomains');
const back = s.toJson();
check(back.indexOf('"focus":"hold"') >= 0 && back.indexOf('"policy":"follow"') >= 0, 'the Focus settings are saved');

const modes = modesOf('{"data":[{"modeConfigurations":{"com.apple.focus.work":{"mode":{"name":"Travail","modeIdentifier":"com.apple.focus.work"}},' +
  '"com.apple.donotdisturb.mode.default":{"mode":{"name":"Ne pas déranger"}}}}]}');
eq(modes.map((x: any) => x.name as string).join(','), 'Travail,Ne pas déranger', 'the Focus modes');
eq(activeOf('{"data":[{"storeAssertionRecords":[{"assertionDetails":{"assertionDetailsModeIdentifier":"com.apple.focus.work"}}]}]}'), 'com.apple.focus.work', 'the Focus on');
eq(activeOf('{"data":[{"storeAssertionRecords":[]}]}'), '', 'no Focus');

if (failed > 0) exit(1);
console.log('unit ok');
