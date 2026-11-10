function unused(): never { throw new Error('unused'); }
function stop(): never { throw new Error('stop'); }
try { stop(); } catch (e) { console.log('unused never'); }
