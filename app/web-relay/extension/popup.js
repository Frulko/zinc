const $ = (id) => document.getElementById(id);
const TEXT = { off: 'Off: the relay renders in its own headless Chrome.', connecting: 'Connecting to the relay…',
  waiting: 'The relay is not running (or its port or token is wrong).', connected: 'On: the relay renders pages in a window of this Chrome.' };
const show = (s) => { $('s').textContent = TEXT[s] || s; };
chrome.runtime.sendMessage({ ask: 'state' }).then((r) => show(r && r.state)).catch(() => show('waiting'));
chrome.runtime.onMessage.addListener((m) => { if (m.state) show(m.state); });
chrome.storage.local.get({ enabled: true }).then((c) => { $('on').checked = c.enabled; });
$('on').onchange = () => chrome.storage.local.set({ enabled: $('on').checked });
$('send').onclick = async () => {
  const [t] = await chrome.tabs.query({ active: true, currentWindow: true });
  const c = await chrome.storage.local.get({ port: 8790, token: '' });
  if (!t || !/^https?:/.test(t.url || '')) { $('m').textContent = 'Only http:// and https:// pages.'; return; }
  try {
    const r = await fetch('http://127.0.0.1:' + c.port + '/send?url=' + encodeURIComponent(t.url) + (c.token ? '&token=' + encodeURIComponent(c.token) : ''));
    $('m').textContent = r.ok ? 'Sent: it opens in a new tab of Zinc Web.' : 'Not sent: ' + (await r.text());
  } catch (e) { $('m').textContent = 'The relay does not answer on port ' + c.port + '.'; }
};
