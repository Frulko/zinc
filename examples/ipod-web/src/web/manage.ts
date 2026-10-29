// The page's manage part (plain JavaScript, appended to script.ts's): uploads by drop or picker, one POST /api/add per file with
// its progress, the delete of the selected songs and the eject, each confirmed inside the page; the specs. Shown only when the
// daemon allows changes; otherwise the panel says why. Same rules as script.ts: no backticks, no dollar-brace, no backslash.

export const MANAGE = `
function manageState(st) {
  var on = !!st.allowChanges && st.open !== '';
  $('manage-on').hidden = !on; $('manage-off').hidden = on;
  $('manage-off').textContent = !st.allowChanges ? 'This daemon is read only: start it with --allow-changes to add, delete or eject.'
    : 'No iPod is open: plug one in to add music.';
  $('select-tools').hidden = !on;
}

function selectionChanged() {
  var n = Object.keys(S.selected).length;
  $('delete').disabled = n === 0;
  $('delete').textContent = n ? 'Delete ' + n + (n === 1 ? ' song' : ' songs') : 'Delete';
  if (n === 0) $('confirm').hidden = true;
}
$('delete').addEventListener('click', function () {
  var ids = Object.keys(S.selected), first = S.byId[ids[0]];
  $('confirm-text').textContent = ids.length === 1 ? 'Delete “' + (first ? first.title : ids[0]) + '” from the iPod?'
    : 'Delete these ' + ids.length + ' songs from the iPod?';
  $('confirm').hidden = false; $('confirm-no').focus();
});
$('confirm-no').addEventListener('click', function () { $('confirm').hidden = true; });
$('confirm-yes').addEventListener('click', function () {
  var ids = Object.keys(S.selected);
  $('confirm-yes').disabled = true;
  api('/api/remove', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: ids }) })
    .then(function (r) { S.selected = {}; say('Deleted ' + r.removed + (r.removed === 1 ? ' song.' : ' songs.')); })
    .catch(function (e) { if (!(e instanceof NeedToken)) say(e.message, true); })
    .then(function () { $('confirm-yes').disabled = false; $('confirm').hidden = true; S.libKey = ''; return refresh(); });
});
function say(text, bad) { var m = $('manage-msg'); m.textContent = text; m.className = bad ? 'err' : 'muted'; if (bad) $('manage').scrollIntoView({ block: 'nearest' }); }

$('eject').addEventListener('click', function () { $('eject-confirm').hidden = false; $('eject-no').focus(); });
$('eject-no').addEventListener('click', function () { $('eject-confirm').hidden = true; });
$('eject-yes').addEventListener('click', function () {
  $('eject-confirm').hidden = true;
  audio.pause(); audio.removeAttribute('src');
  api('/api/eject', { method: 'POST' }).then(function () { say('Ejected: the iPod can be unplugged.'); })
    .catch(function (e) { if (!(e instanceof NeedToken)) say(e.message, true); }).then(refresh);
});

// Uploads: one file at a time (the iPod writes one file at a time anyway), each with its own progress bar and result.
var waiting = [], sending = false;
function addFiles(files) {
  for (var i = 0; i < files.length; i++) {
    var f = files[i], li = el('li'), bar = el('progress');
    bar.max = 1; bar.value = 0;
    li.appendChild(el('span', '', f.name + ' · ' + bytes(f.size))); li.appendChild(bar);
    var res = el('span', 'res muted', 'Waiting'); li.appendChild(res);
    $('uploads').appendChild(li);
    waiting.push({ file: f, bar: bar, res: res });
  }
  next();
}
function next() {
  if (sending) return;
  var u = waiting.shift();
  if (!u) { S.libKey = ''; refresh(); return; }
  sending = true;
  var x = new XMLHttpRequest(), pl = $('add-playlist').value.trim();
  x.open('POST', '/api/add?name=' + encodeURIComponent(u.file.name) + (pl ? '&playlist=' + encodeURIComponent(pl) : ''));
  var h = authHeaders(); if (h.Authorization) x.setRequestHeader('Authorization', h.Authorization);
  x.setRequestHeader('Content-Type', 'application/octet-stream');
  u.res.textContent = 'Sending';
  x.upload.onprogress = function (ev) { if (ev.lengthComputable) u.bar.value = ev.loaded / ev.total; };
  x.onload = function () {
    var j = {}; try { j = JSON.parse(x.responseText); } catch (e) {}
    var r = j.results && j.results[0];
    if (x.status === 401) askToken('This token is not the daemon’s.');
    if (x.status === 200 && r && !r.error) { u.bar.value = 1; u.res.textContent = 'Added'; u.res.className = 'res muted'; }
    else { u.res.textContent = (r && r.error) || j.error || ('HTTP ' + x.status); u.res.className = 'res err'; }
    done();
  };
  x.onerror = function () { u.res.textContent = 'The daemon did not answer.'; u.res.className = 'res err'; done(); };
  function done() { sending = false; next(); }
  x.send(u.file);
}
$('picker').addEventListener('change', function () { addFiles($('picker').files); $('picker').value = ''; });
var drop = $('drop');
['dragenter', 'dragover'].forEach(function (n) { drop.addEventListener(n, function (ev) { ev.preventDefault(); drop.classList.add('over'); }); });
['dragleave', 'drop'].forEach(function (n) { drop.addEventListener(n, function () { drop.classList.remove('over'); }); });
drop.addEventListener('drop', function (ev) { ev.preventDefault(); addFiles(ev.dataTransfer.files); });

// The specs: read when the section is opened.
$('specs').addEventListener('toggle', function () {
  if (!$('specs').open) return;
  api('/api/specs').then(function (r) {
    var t = $('spec-rows'); t.textContent = '';
    var group = null;
    r.specs.forEach(function (s) {
      if (s.group !== group) { group = s.group; var g = el('tr', 'group'); var th = el('th', '', group); th.colSpan = 2; g.appendChild(th); t.appendChild(g); }
      var tr = el('tr'); tr.appendChild(el('th', '', s.name)); tr.appendChild(el('td', '', s.value)); t.appendChild(tr);
    });
  }).catch(function (e) { if (!(e instanceof NeedToken)) $('spec-rows').textContent = e.message; });
});
`;
