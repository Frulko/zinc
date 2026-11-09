// FormData as an upload form or a score submission builds it: entries in order, a Blob as a File, set replacing the first of a name and
// removing the others, iteration, and the multipart/form-data body (with its boundary in the Content-Type) a request sends.
const fd = new FormData();
fd.append('player', 'Ada');
fd.append('score', 1200);
fd.append('tag', 'a');
fd.append('tag', 'b');
fd.append('save', new Blob(['{"level":3}'], { type: 'application/json' }), 'save.json');
fd.append('raw', new Blob(['xy']));
fd.append('quote"name', 'line1\nline2');
console.log('get', fd.get('player'), fd.get('score'), typeof fd.get('score'), fd.get('missing'), fd.has('tag'), fd.getAll('tag').join(','));
const file = fd.get('save');
console.log('file', file instanceof File, file.name, file.type, file.size, fd.get('raw').name);
fd.set('tag', 'c');
console.log('after set', [...fd.keys()].join(','), fd.getAll('tag').join(','));
fd.delete('score');
const seen = [];
fd.forEach((v, k) => seen.push(k + '=' + (typeof v === 'string' ? v.replace('\n', '\\n') : 'File(' + v.name + ')')));
console.log('forEach', seen.join(' '));
console.log('entries', [...fd].length, [...fd.entries()][0].join('='), [...fd.values()][0]);

const req = new Request('https://example.com/upload', { method: 'POST', body: fd });
const type = req.headers.get('content-type'), boundary = type.slice(type.indexOf('boundary=') + 9);
console.log('content-type', type.replace(boundary, '<boundary>'), /^-{4}\w+$/.test(boundary));
req.text().then(body => console.log(JSON.stringify(body.split(boundary).join('<boundary>'))));
const plain = new Request('https://example.com/a', { method: 'POST', body: new URLSearchParams({ a: '1', b: 'x y' }) });
console.log('urlencoded', plain.headers.get('content-type'));
