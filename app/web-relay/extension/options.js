const $ = (id) => document.getElementById(id);
// options.html?port=&token= saves at once (the relay's test configures a fresh profile this way)
const q = new URLSearchParams(location.search);
if (q.has('port')) chrome.storage.local.set({ port: Number(q.get('port')), token: q.get('token') || '', enabled: true }).then(() => { $('m').textContent = 'Saved.'; });
chrome.storage.local.get({ port: 8790, token: '' }).then((c) => {
  $('port').value = q.has('port') ? q.get('port') : c.port;
  $('token').value = q.has('port') ? q.get('token') || '' : c.token;
});
$('save').onclick = () => chrome.storage.local.set({ port: Number($('port').value), token: $('token').value.trim() }).then(() => { $('m').textContent = 'Saved.'; });
