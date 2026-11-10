const assert = (value, message) => { if (!value) throw new Error(message); };
const blobWorker = (source, options) => {
  const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
  const worker = new Worker(url, options);
  URL.revokeObjectURL(url);
  return worker;
};
function message(worker, value, transfer) {
  return new Promise((resolve, reject) => {
    worker.onerror = event => reject(new Error(event.message));
    worker.onmessage = event => resolve(event.data);
    worker.postMessage(value, transfer);
  });
}
const echo = blobWorker(`onmessage = event => postMessage(event.data);`);
const buffer = new Uint8Array([1, 2, 3]).buffer;
const graph = { buffer, view: new Uint8Array(buffer), map: new Map(), set: new Set(), date: new Date(123) };
graph.self = graph; graph.map.set(graph, graph.view); graph.set.add(graph);
const answer = await message(echo, graph, [buffer]);
assert(buffer.byteLength === 0, 'sender buffer detached');
assert(answer.self === answer && answer.view.buffer === answer.buffer && answer.view[2] === 3, 'cycles and shared buffer');
assert(answer.map.get(answer) === answer.view && answer.set.has(answer) && +answer.date === 123, 'Map Set Date');
for (const [value, transfer] of [[() => {}, []], [1, [new Uint8Array(2)]], [1, [answer.buffer, answer.buffer]], [1, [buffer]]]) {
  let name = '';
  try { echo.postMessage(value, transfer); } catch (error) { name = error.name; }
  assert(name === 'DataCloneError', 'DataCloneError: ' + name);
}
const kept = new ArrayBuffer(8);
try { echo.postMessage({ fn() {} }, [kept]); } catch (error) { assert(error.name === 'DataCloneError', 'clone failure'); }
assert(kept.byteLength === 8, 'failed clone retains buffer');
const failure = new TypeError('detail'); failure.cause = failure;
const errorGraph = await message(echo, { first: failure, second: failure });
assert(errorGraph.first === errorGraph.second && errorGraph.first instanceof TypeError && errorGraph.first.cause === errorGraph.first && errorGraph.first.message === 'detail', 'Error clone aliases and cause');
failure.name = '__proto__';
assert((await message(echo, failure)).name === '__proto__', 'custom Error name');
assert(await message(echo, 'again') === 'again', 'capacity reusable after pop');
const byteWorker = blobWorker('onmessage = e => postMessage(e.data.byteLength);');
for (let i = 0; i < 2; i++) {
  const bytes = new ArrayBuffer(9 * 1024 * 1024);
  assert(await message(byteWorker, bytes, [bytes]) === 9 * 1024 * 1024 && bytes.byteLength === 0, 'byte budget released on pop');
}
byteWorker.terminate();
const returning = blobWorker('onmessage = e => { const b = e.data; postMessage(b, [b]); postMessage(b.byteLength); };');
await new Promise((resolve, reject) => {
  let gotBuffer = false;
  returning.onerror = e => reject(Error(e.message));
  returning.onmessage = e => { if (e.data instanceof ArrayBuffer) gotBuffer = e.data.byteLength === 4; else { assert(gotBuffer && e.data === 0, 'worker detaches transferred return buffer'); resolve(); } };
  returning.postMessage(new ArrayBuffer(4));
});
returning.terminate();
const empty = new ArrayBuffer(0);
assert((await message(echo, empty, [empty])).byteLength === 0, 'empty ArrayBuffer transfer');
echo.terminate(); echo.terminate(); echo.postMessage('ignored');
const discarded = new ArrayBuffer(2);
echo.postMessage(discarded, [discarded]);
assert(discarded.byteLength === 0, 'terminated Worker still transfers before discarding');
let terminatedCloneError = false;
try { echo.postMessage(() => {}); } catch (error) { terminatedCloneError = error.name === 'DataCloneError'; }
assert(terminatedCloneError, 'terminated Worker still validates clone');
const handlers = blobWorker(`
  let messageError = false, errorArguments = false;
  onmessageerror = event => { messageError = event.data === 'bad'; };
  onerror = (message, filename, line, column, error) => { errorArguments = message === 'failure' && error instanceof TypeError; return true; };
  dispatchEvent(new MessageEvent('messageerror', { data: 'bad' }));
  const canceled = !dispatchEvent(new ErrorEvent('error', { cancelable: true, message: 'failure', error: new TypeError('detail') }));
  postMessage(messageError && errorArguments && canceled); close();
`);
assert(await new Promise((resolve, reject) => { handlers.onmessage = event => resolve(event.data); handlers.onerror = event => reject(Error(event.message)); }), 'worker global handler properties');
handlers.terminate();
const classic = new Worker(new URL('./classic.js', import.meta.url));
assert(await message(classic, 'file') === 'classic:file', 'classic file');
classic.terminate();
const moduleWorker = new Worker(new URL('./module.js', import.meta.url), { type: 'module' });
assert(await message(moduleWorker, 'hello') === 'hello:module', 'module import');
moduleWorker.terminate();
const blobModule = blobWorker('onmessage = e => { postMessage(e.data + ":blob-module"); close(); }; export {};', { type: 'module' });
assert(await message(blobModule, 'hello') === 'hello:blob-module', 'Blob module');
blobModule.terminate();
const full = blobWorker('while (true) {}');
let count = 0, refused = false;
const retained = new ArrayBuffer(1);
try { for (; count < 300; count++) full.postMessage(count, count === 256 ? [retained] : []); }
catch (error) { refused = error instanceof RangeError; }
assert(refused && count === 256 && retained.byteLength === 1, 'bounded queue retains refused transfer');
full.terminate();
const crash = blobWorker('throw new Error("worker failure");');
await new Promise(resolve => { crash.onerror = event => { assert(event.message.includes('worker failure'), 'crash reported'); event.preventDefault(); resolve(); }; });
crash.terminate();
await new Promise(resolve => setTimeout(resolve, 1));
console.log('web Worker: clone transfer module Blob capacity crash PASS');
