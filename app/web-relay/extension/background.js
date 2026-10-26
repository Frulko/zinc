// Zinc Web relay extension: the relay (app/web-relay, --browser extension) drives one tab of this Chrome over the DevTools protocol.
// The service worker connects to ws://127.0.0.1:<relay port + 1>/extension?token=..., opens its own window on the relay's Zinc.open,
// attaches chrome.debugger to that one tab and passes the relay's commands to it and the tab's events back. Nothing else is reachable:
// the commands are an allow-list of what the relay uses, and every other tab and window is left alone. Off (the popup) detaches and
// closes the window and the connection.

// What the relay sends (src/main.ts): nothing that reads cookies, storage or other tabs.
const ALLOWED = new Set(['Page.enable', 'Page.navigate', 'Page.reload', 'Page.captureScreenshot', 'Page.addScriptToEvaluateOnNewDocument',
  'Runtime.evaluate', 'Emulation.setDeviceMetricsOverride', 'Emulation.setEmulatedVisionDeficiency', 'Emulation.setEmulatedMedia',
  'Network.enable', 'Network.setBlockedURLs']);

let ws = null;          // the relay's connection
let tab = null;         // { windowId, tabId } of the dedicated window, attached
let state = 'off';      // off, connecting, waiting (no relay), connected

function config() { return chrome.storage.local.get({ enabled: true, port: 8790, token: '' }); }
function setState(s) {
  state = s;
  chrome.action.setBadgeText({ text: s === 'connected' ? 'on' : '' });
  chrome.runtime.sendMessage({ state: s }).catch(() => {});
}

async function connect() {
  const c = await config();
  if (!c.enabled) { setState('off'); return; }
  if (ws !== null) return;
  setState('connecting');
  const sock = new WebSocket('ws://127.0.0.1:' + (Number(c.port) + 1) + '/extension?token=' + encodeURIComponent(c.token));
  ws = sock;
  sock.onopen = () => setState('connected');
  sock.onmessage = (e) => receive(sock, e.data);
  sock.onclose = () => { if (ws === sock) { ws = null; release(); setState('waiting'); } };
  sock.onerror = () => {};
}

function send(m) { if (ws !== null && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(m)); }

/** The dedicated window: small, not focused, so the window in use stays in front. */
async function open() {
  if (tab !== null) return;
  const w = await chrome.windows.create({ url: 'about:blank', focused: false, width: 520, height: 700, type: 'normal' });
  const t = { windowId: w.id, tabId: w.tabs[0].id };
  await chrome.debugger.attach({ tabId: t.tabId }, '1.3');
  tab = t;
}

async function release() {
  const t = tab;
  tab = null;
  if (t === null) return;
  try { await chrome.debugger.detach({ tabId: t.tabId }); } catch (e) {}
  try { await chrome.windows.remove(t.windowId); } catch (e) {}
}

async function receive(sock, text) {
  let m;
  try { m = JSON.parse(text); } catch (e) { return; }
  if (typeof m.id !== 'number' || typeof m.method !== 'string') return;
  try {
    let result = {};
    if (m.method === 'Zinc.open') await open();
    else if (!ALLOWED.has(m.method)) throw new Error(m.method + ' is not allowed by the Zinc extension');
    else if (tab === null) throw new Error('no tab: the relay sends Zinc.open first');
    else {
      const p = m.params || {};
      if (m.method === 'Page.navigate' && !/^https?:\/\//.test(String(p.url))) throw new Error('only http:// and https:// pages');
      result = await chrome.debugger.sendCommand({ tabId: tab.tabId }, m.method, p);
    }
    if (ws === sock) send({ id: m.id, result: result || {} });
  } catch (e) {
    if (ws === sock) send({ id: m.id, error: { message: String((e && e.message) || e) } });
  }
}

chrome.debugger.onEvent.addListener((source, method, params) => {
  if (tab !== null && source.tabId === tab.tabId) send({ method, params });
});
// the user closed the window or pressed Cancel on Chrome's debugging bar: the relay is told by closing its connection
chrome.debugger.onDetach.addListener((source) => {
  if (tab !== null && source.tabId === tab.tabId) { tab = null; if (ws !== null) ws.close(); }
});
chrome.windows.onRemoved.addListener((id) => {
  if (tab === null || tab.windowId !== id) return;
  const t = tab;
  tab = null;
  chrome.debugger.detach({ tabId: t.tabId }).catch(() => {});
  if (ws !== null) ws.close();
});

// Off and on, the port and the token (popup, options page): start again with the new settings
chrome.storage.onChanged.addListener(async () => {
  const c = await config();
  if (ws !== null) { const s = ws; ws = null; s.close(); await release(); }
  if (c.enabled) connect(); else setState('off');
});
chrome.runtime.onMessage.addListener((m, sender, reply) => { if (m.ask === 'state') reply({ state }); });

// Messages keep the worker alive while connected; the ping every 20 s covers quiet times. The alarm tries again while the relay is
// not running (and wakes a worker Chrome stopped).
setInterval(() => send({ ping: 1 }), 20000);
chrome.alarms.create('relay', { periodInMinutes: 0.5 });
chrome.alarms.onAlarm.addListener(() => connect());
chrome.runtime.onStartup.addListener(() => connect());
chrome.runtime.onInstalled.addListener(() => connect());
connect();
