const url = URL.createObjectURL(new Blob([`
  onmessage = async () => {
    const results = [];
    for (const url of ['file:///etc/hosts', 'https://example.com/']) {
      try { await fetch(url); results.push(false); }
      catch (error) { results.push(error instanceof TypeError); }
    }
    postMessage(results); close();
  };
`]));
const worker = new Worker(url);
URL.revokeObjectURL(url);
try {
  await new Promise((resolve, reject) => {
    worker.onerror = event => reject(Error(event.message));
    worker.onmessage = event => { if (event.data.length === 2 && event.data.every(Boolean)) resolve(); else reject(Error('worker widened permissions')); };
    worker.postMessage('go');
  });
  console.log('web Worker: enforced file and network permission denial PASS');
} finally { worker.terminate(); }
