onmessage = event => { postMessage('classic:' + event.data); close(); };
