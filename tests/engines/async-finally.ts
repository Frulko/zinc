async function override(): Promise<number> { try { return 1; } finally { console.log('finally',await 2); return 3; } }
async function rejected(): Promise<number> { try { await Promise.reject(new Error('original')); } catch(e){console.log('catch',e.message,await 4);} finally {console.log('done',await 5);} return 6; }
async function loop(): Promise<void> { for(let i=0;i<3;i++){try{console.log('body',i);}finally {console.log('loop cleanup',await i);if(i===1)break;}} }
async function order(): Promise<void> { console.log('override',await override()); console.log('recovered',await rejected()); await loop(); }
order(); console.log('sync');
