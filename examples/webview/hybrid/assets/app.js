// Page side of the hybrid example: calls Zinc commands with zinc.invoke, receives pushes on zinc.onmessage.
const $ = (id) => document.getElementById(id);
let current = '';

async function listFiles() {
  const files = await zinc.invoke('listFiles');
  $('files').innerHTML = '';
  for (const f of files) {
    const li = document.createElement('li');
    li.textContent = f;
    li.onclick = () => { open(f); zinc.postMessage('select:' + f); };
    $('files').appendChild(li);
  }
  mark();
  return files;
}

async function open(name) {
  current = name;
  mark();
  $('name').textContent = name;
  try { $('content').textContent = await zinc.invoke('readFile', name); }
  catch (e) { $('content').textContent = 'error: ' + e.message; }
}
function mark() { for (const li of $('files').children) li.className = li.textContent === current ? 'on' : ''; }

zinc.onmessage = (m) => {
  if (m.type === 'tick') $('stats').textContent = `Zinc: up ${m.uptime}s, ${m.fps} fps, selected: ${m.selected || '-'}`;
  if (m.type === 'ping') $('ping').textContent = `ping #${m.n} from the native sidebar`;
  if (m.type === 'open') open(m.name);
};

$('list').onclick = listFiles;
$('bad').onclick = async () => {
  try { await zinc.invoke('rm -rf', '/'); } catch (e) { $('ping').textContent = 'rejected: ' + e.message; }
};

listFiles().then((files) => zinc.postMessage('ready:' + files.length));
