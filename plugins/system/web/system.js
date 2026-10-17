// zinc:system in the browser: the native side of plugins/system/native/system.spec.ts, three calls that carry JSON ops (docs/targets/web.md, "Plugins").
// What a page can do is done with the web API that stands for it; the rest answers {"error":{"code":"unsupported"}}, which index.ts turns into a
// SystemError('unsupported') and supports() reports as false, so a program asks first and the desktop-only parts (menus, tray, dock menu, global
// shortcuts, autostart, deep-link registration, window geometry, updates) stay off. index.ts and its feature modules run unchanged.
// Browser calls that answer later (permission questions, the share sheet, the wake lock) return what is known now and finish in the background.
const Z = globalThis.__zincWeb;
const g = globalThis;
let listener = null;
const emit = (type, ...args) => { if (listener) listener(JSON.stringify({ type, args })); };
const err = (code, message) => JSON.stringify({ error: { code, message } });
const unsupported = (op) => err('unsupported', `${op} has no equivalent in a browser`);
const ok = (o = {}) => JSON.stringify(o);
const FEATURES = {
  notification: () => !!g.Notification, clipboard: () => !!(g.navigator.clipboard && g.navigator.clipboard.writeText), opener: () => true, share: () => !!g.navigator.share,
  power: () => !!g.navigator.wakeLock, window: () => true, dialog: () => true, dock: () => !!g.navigator.setAppBadge, instance: () => true, 'deep-link': () => true,
};
const notes = new Map();
const wake = new Map();
let wakeId = 0;
const dark = g.matchMedia ? g.matchMedia('(prefers-color-scheme: dark)') : null;
if (dark && dark.addEventListener) dark.addEventListener('change', (e) => emit('appearance', e.matches ? 'dark' : 'light'));
const store = (k, v) => { try { if (v === undefined) return g.localStorage.getItem('zinc:window:' + k); g.localStorage.setItem('zinc:window:' + k, v); } catch { return null; } return null; };
let lastClip = { text: '', html: '' };

const ops = {
  'notification.backend': () => ok({ backend: g.Notification ? 'native' : 'none' }),
  'notification.requestPermission': () => {
    if (!g.Notification) return ok({ state: 'unsupported' });
    if (g.Notification.permission === 'default') g.Notification.requestPermission().catch(() => {});   // the answer is there when asked again
    return ok({ state: g.Notification.permission });
  },
  'notification.notify': (a) => {
    if (!g.Notification) return ok({ id: a.id, delivered: false, reason: 'unsupported' });
    if (g.Notification.permission !== 'granted') return ok({ id: a.id, delivered: false, reason: g.Notification.permission === 'denied' ? 'denied' : 'permission not asked yet: call requestPermission() from a click' });
    const n = new g.Notification(a.title, { body: [a.subtitle, a.body].filter(Boolean).join('\n'), tag: a.group || a.id, silent: a.sound === false, icon: a.icon || undefined });
    n.onclick = () => emit('notification-click', a.id);
    n.onclose = () => emit('notification-close', a.id, 'user');
    notes.set(a.id, n);
    return ok({ id: a.id, delivered: true });
  },
  'notification.cancel': (a) => { const n = notes.get(a.id); if (n) { n.close(); notes.delete(a.id); } return ok(); },
  'notification.delivered': () => ok({ items: [...notes.keys()].map((id) => ({ id, title: '', body: '' })) }),
  'notification.openSettings': () => ok({ opened: false }),
  'clipboard.writeRich': (a) => {
    lastClip = { text: a.text || '', html: a.html || '' };
    const c = g.navigator.clipboard;
    if (!c) return unsupported('clipboard.writeRich');
    if (a.html && g.ClipboardItem) c.write([new g.ClipboardItem({ 'text/html': new Blob([a.html], { type: 'text/html' }), 'text/plain': new Blob([a.text || ''], { type: 'text/plain' }) })]).catch(() => {});
    else c.writeText(a.text || '').catch(() => {});
    return ok();
  },
  'clipboard.readRich': () => ok({ text: Z.input ? Z.input.clip || lastClip.text : lastClip.text, html: lastClip.html }),
  'opener.open': (a) => { g.open(a.target, '_blank', 'noopener,noreferrer'); return ok(); },
  'opener.last': () => ok({ text: '' }),
  'share.share': (a) => {
    if (!g.navigator.share) return ok({ shared: false });
    g.navigator.share({ text: a.text, url: a.url, title: a.title }).catch(() => {});
    return ok({ shared: true });
  },
  'window.setTitle': (a) => { g.document.title = a.title; return ok(); },
  'window.setFullscreen': (a) => { try { if (a.on) g.document.documentElement.requestFullscreen(); else if (g.document.fullscreenElement) g.document.exitFullscreen(); } catch {} return ok(); },
  'window.setOptions': () => ok(), 'window.confirmClose': () => ok(), 'window.show': () => ok(), 'window.focus': () => { g.focus(); return ok(); },
  'window.dataDir': () => ok({ path: '/' }),
  'window.state.save': () => { store('state', JSON.stringify({ w: g.innerWidth, h: g.innerHeight })); return ok(); },
  'window.state.restore': () => ok({ restored: store('state') !== null }),
  'power.appearance': () => ok({ dark: !!(dark && dark.matches) }),
  'power.battery': () => ok({ present: false, percent: 0, charging: false }),
  'power.idleSeconds': () => ok({ seconds: 0 }),
  'power.preventSleep': () => {
    const id = ++wakeId;
    if (g.navigator.wakeLock) g.navigator.wakeLock.request('screen').then((s) => wake.set(id, s), () => {});
    return ok({ token: id });
  },
  'power.release': (a) => { const s = wake.get(a.token); if (s) { s.release().catch(() => {}); wake.delete(a.token); } return ok(); },
  'dock.setBadge': (a) => { const n = parseInt(a.text, 10); if (g.navigator.setAppBadge) { (Number.isFinite(n) && n > 0 ? g.navigator.setAppBadge(n) : g.navigator.clearAppBadge()).catch(() => {}); } return ok(); },
  'dock.getBadge': () => ok({ text: '' }),
  'dialog.message': (a) => {   // the browser's own blocking boxes: an OK, or OK and Cancel
    const text = [a.title, a.message, a.detail].filter(Boolean).join('\n\n');
    if ((a.buttons || []).length >= 2) return ok({ button: g.confirm(text) ? 0 : 1 });
    g.alert(text);
    return ok({ button: 0 });
  },
  'instance.lock': () => ok({ first: true }),
  'deep-link.getCurrent': () => ok({ urls: [g.location.href] }),
  'shortcut.register': () => ok({ status: 'unsupported' }),
  'shortcut.unregister': () => ok(),
  'tray.available': () => ok({ available: false }),
};
// Presentation only: an application menu, a tray icon, a dock menu, the window's size or look. A page has none of them, and a program that sets them up loses nothing by
// their absence (supports('menu') and supports('tray') say false for the programs that want to adapt), so the call is accepted and does nothing.
for (const op of ['menu.setApp', 'menu.update', 'tray.create', 'tray.update', 'tray.remove', 'dock.setMenu', 'dock.setProgress', 'dock.bounce', 'window.setSize', 'window.setPosition', 'window.center',
  'window.setAlwaysOnTop', 'window.setOpacity', 'window.setMinSize', 'window.maximize', 'window.minimize', 'window.hide', 'window.setTitleBar', 'window.setTrafficLights', 'window.setVibrancy'])
  ops[op] = () => ok();

Z.registerNative('System', {
  setPermissions() {}, setApp() {}, setScopes() {},
  supports(feature) { const f = FEATURES[feature]; return !!(f && f()); },
  backend() { return 'web'; },
  onEvent(cb) { listener = cb; },
  call(op, json) {
    let args = {};
    try { args = json ? JSON.parse(json) : {}; } catch { return err('failed', 'bad arguments'); }
    const f = ops[op];
    if (!f) return unsupported(op);
    try { return f(args); } catch (e) { return err('failed', String(e && e.message || e)); }
  },
}, []);
